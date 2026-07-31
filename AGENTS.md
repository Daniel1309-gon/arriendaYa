# AGENTS.md — ArriendaYa

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
uv run python main.py                  # runs with APScheduler (mock data → MongoDB)
```

## Gotchas

- **Postgres is on port 5433** (not 5432) — `DATABASE_URL` must use `localhost:5433`.
- **Prisma client output** is `backend/generated/prisma/` (not default `node_modules/.prisma`). Import from there.
- **No test framework** is configured yet in any package.
- **OTP email is mocked** — codes are logged to console (`backend/src/modules/auth/`).
- Backend is ESM (`"type": "module"` in package.json).
- Scraper uses `uv` — do NOT create a manual venv or use pip. `uv run` handles everything.
- `.env` files are required in `backend/`, `frontend/`, and `scraper/` (see `.env.example` in each).
- `backend/generated/` is committed (Prisma client output) — regenerate after schema changes.

## Architecture notes

- **Auth**: passwordless — OTP via Redis (key `otp:{email}`, TTL 300s) + Google OAuth2. JWT via `@fastify/jwt`.
- **Data split**: User/own listings in Postgres (Prisma). Scraped listings in MongoDB (collection `inmuebles_scrapeados`, validated with Zod/Pydantic). Redis for OTP + view history (`user:{userId}:history`, list, trimmed to 10).
- **Backend modules**: `src/modules/{auth,usuarios,inmuebles}/` — routes + services per domain.
- **Validation**: Zod schemas with `fastify-type-provider-zod` for request validation.
- **Scraper scheduler**: APScheduler `BackgroundScheduler`, 3-hour interval. Mock scraper (`scrape_mock()`) upserts by `urlOriginal`.

## Account deletion & recovery

Accounts use **soft delete with a 14-day grace period** (`ACCOUNT_DELETION_GRACE_PERIOD_MS` in `backend/src/modules/auth/account-recovery.ts`).

- `Usuario.eliminadoEn` and `Usuario.eliminacionProgramadaEn` mark the tombstone.
- `DELETE /usuarios/perfil` sets both fields and returns `eliminacionProgramadaEn` so the client can show the exact date. Rate limit: `max: 3 / 1 hour`.
- A background job in `backend/src/jobs/purge-deleted-accounts.ts` runs hourly and hard-deletes accounts whose deadline has passed (cascade removes their `Inmueble` rows).
- Recovery is handled through `POST /auth/cuenta/recuperar` (OTP) and `POST /auth/cuenta/recuperar/google`. The endpoint `POST /auth/cuenta/recuperar/confirmar` clears the tombstone and emits a fresh JWT.
- `authenticate` middleware re-checks `eliminadoEn` on every request, so a JWT issued before soft-delete stops working immediately.

**Email notifications (pending real provider):** when the email provider is integrated, the same channel used for OTP will deliver:
- the deletion-scheduled email (date + recovery link) right after `DELETE /usuarios/perfil`,
- the recovery OTP,
- the reactivation confirmation.

Today those emails are stubbed with `console.log` and a `TODO(email)` comment at the call site.

Tests for the soft-delete / recovery / purge flow are **deferred** until the real scraper is in place.
