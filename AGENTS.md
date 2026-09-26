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
- **Cloudinary is optional** — `POST /inmuebles/:id/imagenes` needs `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET`; deletion and account purge attempt prefix cleanup when configured. Unlike `RESEND_API_KEY`, the variables are validated lazily, so the server boots without them. Uploads return `503`; deletes/purge proceed with a warning and cannot clean existing assets.
- Backend is ESM (`"type": "module"` in package.json).
- Scraper uses `uv` — do NOT create a manual venv or use pip. `uv run` handles everything.
- `.env` files are required in `backend/`, `frontend/`, and `scraper/` (see `.env.example` in each).
- `backend/generated/` is committed (Prisma client output) — regenerate after schema changes.

## Architecture notes

- **Auth**: passwordless — OTP via Redis (key `otp:{email}`, TTL 300s) + Google OAuth2. JWT via `@fastify/jwt`.
- **Data split**: User/own listings in Postgres (Prisma). Scraped listings in MongoDB (collection `inmuebles_scrapeados`, validated with Zod/Pydantic). Redis for OTP + view history (`user:{userId}:history`, list, trimmed to 10).
- **Backend modules**: `src/modules/{auth,usuarios,inmuebles}/` — routes + services per domain.
- **Validation**: Zod schemas with `fastify-type-provider-zod` for request validation.
- **Listing photos**: both sources expose `imagenes: string[]`, normalized in `backend/src/modules/inmuebles/inmuebles.serialize.ts` (also strips Mongo's `_id`), so the client never has to guard for a missing key. Scraped listings hotlink the portal CDN (`cdn2.infocasas.com.uy`) — the URL stored is the **full-resolution** one, and `imagenThumb()` in `frontend/src/lib/inmuebles.ts` derives a ~18 KB thumbnail by inserting `th.outside{W}x{H}.` (Cloudinary URLs get `f_auto,q_auto,c_limit,w_{W}` instead). Own listings upload to Cloudinary via `POST /inmuebles/:id/imagenes`; `imagenes` is deliberately **not** in `CreateInmuebleSchema` because `POST`/`PUT` spread the body straight into Prisma. Uploads ignore the client's declared mimetype, decode with Sharp under byte/pixel/dimension limits, reject animated/non-raster inputs, re-encode to WebP, and only then send the sanitized buffer to Cloudinary.
- **Scraper**: real Fincaraiz scraper (`scraper/scrapers/fincaraiz.py`) plus Metrocuadrado (`scraper/scrapers/metrocuadrado.py`). Fincaraiz parses `__NEXT_DATA__` from listing pages; Metrocuadrado opens `/inmuebles/...` with Playwright and calls `/rest-search/search` in-page with `X-Api-Key`. Ambos mapean a `InmuebleScraped` (`scraper/models.py`), upsertan por `id` y rotan su cursor independiente en Mongo (`scraper_meta`): Fincaraiz por página y Metrocuadrado por offset `from`. Metrocuadrado visita el detalle de anuncios nuevos para extraer coordenadas exactas, estrato, piso, antigüedad, administración y características. Las imágenes de Metrocuadrado vienen de `multimedia.metrocuadrado.com` en variantes `_p.jpg`. Antes de navegar se consulta `robots.txt`; la ruta nueva `/inmuebles/...` y el endpoint de búsqueda están permitidos actualmente. APScheduler usa `BlockingScheduler`, intervalo de 3 horas (`SCRAPE_INTERVAL_HOURS`), `max_instances=1` y `coalesce=True`. Listings no refrescados dentro de `INACTIVE_AFTER_DAYS` (default 14) se marcan `activo: false` (nunca se borran); el período debe superar el barrido completo y se emite warning si no. Backend `GET /inmuebles` filtra `activo: { $ne: false }`.

## Account deletion & recovery

Accounts use **soft delete with a 14-day grace period** (`ACCOUNT_DELETION_GRACE_PERIOD_MS` in `backend/src/modules/auth/account-recovery.ts`).

- `Usuario.eliminadoEn` and `Usuario.eliminacionProgramadaEn` mark the tombstone.
- `DELETE /usuarios/perfil` sets both fields and returns `eliminacionProgramadaEn` so the client can show the exact date. Rate limit: `max: 3 / 1 hour`.
- A background job in `backend/src/jobs/purge-deleted-accounts.ts` runs hourly, cleans Redis and the user's Cloudinary prefix, then hard-deletes accounts whose deadline has passed (cascade removes their `Inmueble` rows).
- Recovery is handled through `POST /auth/cuenta/recuperar` (OTP) and `POST /auth/cuenta/recuperar/google`. The endpoint `POST /auth/cuenta/recuperar/confirmar` clears the tombstone and emits a fresh JWT.
- `authenticate` middleware re-checks `eliminadoEn` on every request, so a JWT issued before soft-delete stops working immediately.

**Email notifications** are delivered via **Resend** (`backend/src/email/mailer.ts`). The same channel handles the OTP for login, the recovery OTP, the deletion-scheduled notice (date + recovery link), and the reactivation confirmation. The first three flows block on send failures (the endpoint returns `502` and rolls back any Redis/DB side effects); the reactivation email is best-effort and never blocks the response. Configure `RESEND_API_KEY`, `EMAIL_FROM` and `FRONTEND_URL` in `backend/.env`.

Tests for the soft-delete / recovery / purge flow are **deferred** until the real scraper is in place.
