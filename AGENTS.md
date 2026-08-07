# AGENTS.md — Rentia

## Project structure

pnpm monorepo (workspaces: `frontend`, `backend`) + standalone Python `scraper/` managed with **uv**.

```
frontend/   Vite + React 19 + TS + Tailwind v4
backend/    Fastify 5 + TS + Prisma 7 (Postgres) + MongoDB + Redis (ioredis)
scraper/    Python 3.13+, uv, Playwright/BS4, pymongo, APScheduler
docker-compose.yml   Postgres + MongoDB + Redis
```

## Commands

```bash
# Infrastructure
docker compose up -d          # Postgres (:5433), MongoDB (:27017), Redis (:6379)

# Node packages
pnpm install                  # from root — installs frontend + backend

# Backend
pnpm --filter backend dev              # tsx watch src/server.ts (port 3000)
pnpm --filter backend exec prisma generate   # regenerate Prisma client
pnpm --filter backend exec prisma migrate dev --name <name>

# Frontend
pnpm --filter frontend dev             # vite dev server
pnpm --filter frontend build           # tsc -b && vite build
pnpm --filter frontend lint            # eslint

# Scraper (from scraper/)
uv run playwright install chromium     # one-time: download Chromium for Playwright
uv run python main.py                  # corrida inmediata + APScheduler cada 3h (Fincaraiz → MongoDB)
```

## Gotchas

- **Postgres is on port 5433** (not 5432) — `DATABASE_URL` must use `localhost:5433`.
- **Prisma client output** is `backend/generated/prisma/` (not default `node_modules/.prisma`). Import from there.
- **No test framework** is configured yet in any package.
- **OTP email** is delivered via Resend (`backend/src/email/mailer.ts`); login/recovery/deletion-scheduled sends block on failure (HTTP `502`), reactivation email is best-effort.
- Backend is ESM (`"type": "module"` in package.json).
- Scraper uses `uv` — do NOT create a manual venv or use pip. `uv run` handles everything.
- `.env` files are required in `backend/`, `frontend/`, and `scraper/` (see `.env.example` in each).
- `backend/generated/` is committed (Prisma client output) — regenerate after schema changes.

## Architecture notes

- **Auth**: passwordless — OTP via Redis (key `otp:{email}`, TTL 300s) + Google OAuth2. JWT via `@fastify/jwt`.
- **Data split**: User/own listings in Postgres (Prisma). Scraped listings in MongoDB (collection `inmuebles_scrapeados`, validated with Zod/Pydantic). Redis for OTP + view history (`user:{userId}:history`, list, trimmed to 10).
- **Backend modules**: `src/modules/{auth,usuarios,inmuebles}/` — routes + services per domain.
- **Validation**: Zod schemas with `fastify-type-provider-zod` for request validation.
- **Scraper**: real Fincaraiz scraper (`scraper/scrapers/fincaraiz.py`). Parses the `__NEXT_DATA__` JSON from listing pages (no detail fetch needed) and maps each item to `InmuebleScraped` (pydantic, `scraper/models.py`). Pagination is **path-based** (`…/bogota-dc/pagina2`; the `?pagina=N` query param is ignored by the server). The page window **rotates between runs** via a cursor persisted in Mongo (`scraper_meta`, doc `cursor:fincaraiz`), so the full ~328-page catalog is swept in ~8.2 days with defaults. APScheduler `BlockingScheduler`, 3-hour interval (`SCRAPE_INTERVAL_HOURS`), `max_instances=1` + `coalesce=True`. Upserts by `id` (unique index; `urlOriginal` is non-unique because slugs change). Listings not refreshed within `INACTIVE_AFTER_DAYS` (default 14) are marked `activo: false` (never hard-deleted) — the invariant is `INACTIVE_AFTER_DAYS` > full-sweep period, and a warning is logged when violated. Backend `GET /inmuebles` filters `activo: { $ne: false }`. Metrocuadrado is intentionally excluded (its `robots.txt` forbids the results path and it sits behind Incapsula).

## Account deletion & recovery

Accounts use **soft delete with a 14-day grace period** (`ACCOUNT_DELETION_GRACE_PERIOD_MS` in `backend/src/modules/auth/account-recovery.ts`).

- `Usuario.eliminadoEn` and `Usuario.eliminacionProgramadaEn` mark the tombstone.
- `DELETE /usuarios/perfil` sets both fields and returns `eliminacionProgramadaEn` so the client can show the exact date. Rate limit: `max: 3 / 1 hour`.
- A background job in `backend/src/jobs/purge-deleted-accounts.ts` runs hourly and hard-deletes accounts whose deadline has passed (cascade removes their `Inmueble` rows).
- Recovery is handled through `POST /auth/cuenta/recuperar` (OTP) and `POST /auth/cuenta/recuperar/google`. The endpoint `POST /auth/cuenta/recuperar/confirmar` clears the tombstone and emits a fresh JWT.
- `authenticate` middleware re-checks `eliminadoEn` on every request, so a JWT issued before soft-delete stops working immediately.

**Email notifications** are delivered via **Resend** (`backend/src/email/mailer.ts`). The same channel handles the OTP for login, the recovery OTP, the deletion-scheduled notice (date + recovery link), and the reactivation confirmation. The first three flows block on send failures (the endpoint returns `502` and rolls back any Redis/DB side effects); the reactivation email is best-effort and never blocks the response. Configure `RESEND_API_KEY`, `EMAIL_FROM` and `FRONTEND_URL` in `backend/.env`.

Tests for the soft-delete / recovery / purge flow are **deferred** until the real scraper is in place.
