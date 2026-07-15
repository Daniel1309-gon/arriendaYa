# Plan de Implementación — ArriendaYa (Core MVP)

Agregador y portal de arriendos para Bogotá. Arquitectura modular en monorepo, corriendo inicialmente en una sola instancia, lista para escalar.

## Decisiones técnicas confirmadas

| Aspecto | Decisión |
|---|---|
| ORM | Prisma (Postgres) |
| Infra local (Postgres/Mongo/Redis) | Docker Compose |
| Envío de OTP | Log en consola (sin proveedor de email real todavía) |
| Google OAuth | Se crean credenciales nuevas (Google Cloud Console) |
| Package manager (Node) | pnpm (workspaces) |
| Gestor de paquetes (Python/scraper) | uv |

---

## Estructura del Monorepo

```
/arriendaya
  /frontend           # Vite + React + TS + Tailwind
  /backend            # Fastify + TS + Prisma
  /scraper            # Python (gestionado con uv) + Playwright/BeautifulSoup + pymongo
  docker-compose.yml  # Postgres + MongoDB + Redis
  pnpm-workspace.yaml  # workspaces: frontend, backend
  package.json
```

`pnpm-workspace.yaml` orquesta `frontend` y `backend` desde la raíz. `scraper` queda fuera del workspace de Node: es un proyecto Python independiente gestionado con `uv` (`pyproject.toml` + `uv.lock`, sin `requirements.txt` ni `venv` manual).

---

## Fase 1 — Estructura base y entorno

1. Crear carpeta raíz `/arriendaya` con subcarpetas `frontend`, `backend`, `scraper`.
2. Crear `pnpm-workspace.yaml` en la raíz declarando `frontend` y `backend` como paquetes del workspace.
3. Inicializar `frontend` con `pnpm create vite@latest` (template `react-ts`) + Tailwind CSS.
4. Inicializar `backend` con Fastify + TypeScript (`tsx` para desarrollo, `tsc`/`esbuild` para build).
5. Inicializar `scraper` con `uv init` (genera `pyproject.toml`), y `uv add playwright beautifulsoup4 pymongo apscheduler pydantic` para declarar dependencias. `uv run` ejecuta el script sin activar manualmente ningún entorno virtual.
6. Crear `docker-compose.yml` en la raíz con 3 servicios:
   - `postgres:16` (puerto 5432, volumen persistente)
   - `mongo:7` (puerto 27017, volumen persistente)
   - `redis:7` (puerto 6379, volumen persistente)
7. Crear `.env.example` en `backend` y `scraper` documentando todas las variables necesarias (connection strings, JWT secret, Google Client ID/Secret, etc.). `.env` real va a `.gitignore`.
8. Inicializar repositorio git y `.gitignore` (node_modules, dist, .env, `.venv` de uv).

**Entregable:** monorepo funcional, `docker compose up` levanta las 3 bases de datos, `pnpm install` resuelve frontend + backend.

---

## Fase 2 — Base de datos y esquemas

### Postgres (Prisma)

`backend/prisma/schema.prisma` con dos modelos:

- **Usuario**
  - `id` (UUID, default `uuid()`)
  - `email` (String, `@unique`)
  - `zonasInteres` (String[] — array nativo Postgres para códigos UPZ)
  - `edad` (Int?, opcional)
  - `ciudadOrigen` (String?, opcional)
  - `telefono` (String?, opcional)
  - `presupuestoMin` (Decimal?, opcional)
  - `presupuestoMax` (Decimal?, opcional)
  - `googleId` (String?, opcional, `@unique`)
  - `fechaCreacion` (DateTime, `@default(now())`)
  - Relación 1-N con `Inmueble`

- **Inmueble**
  - `id` (UUID, default `uuid()`)
  - `usuarioId` (FK → Usuario)
  - `valorCanon` (Decimal, requerido)
  - `administracionIncluida` (Boolean, requerido)
  - `valorAdministracion` (Decimal?, opcional)
  - `tamanoM2` (Int, requerido)
  - `habitaciones` (Int, requerido)
  - `banos` (Int, requerido)
  - `patio` (Boolean, default false)
  - `parqueaderos` (Int, default 0)
  - `antiguedadAnos` (Int)
  - `estrato` (Int, 1–6, validado en Zod a nivel de aplicación ya que Prisma no soporta CHECK constraints nativamente)
  - `piso` (Int)
  - `ascensor` (Boolean)
  - `petFriendly` (Boolean, default false)
  - `latitud` (Float/Decimal)
  - `longitud` (Float/Decimal)
  - `url` (String?, opcional)

Pasos:
1. Definir `schema.prisma` con ambos modelos y la relación.
2. Ejecutar `prisma migrate dev --name init` para generar la migración inicial.
3. Generar el cliente Prisma (`prisma generate`).
4. Crear `src/db/prisma.ts` exportando una instancia singleton de `PrismaClient`.

### MongoDB (inmuebles scrapeados)

- Colección `inmuebles_scrapeados` replicando los campos de `Inmueble` (como documento plano, sin relación a `usuarioId`) más:
  - `portalOrigen` (String — ej. `'fincaraiz'`, `'metrocuadrado'`)
  - `urlOriginal` (String, requerido)
  - `fechaScraping` (Date, default `now()`)
- Validación a nivel de aplicación (Zod en backend para lectura, `pydantic` en scraper para escritura), sin schema rígido de Mongo (colección flexible).
- Crear `src/db/mongo.ts` en backend con el cliente `mongodb` nativo (no Mongoose, para mantener consistencia con "datos semiestructurados").

### Redis

- Cliente `ioredis` en backend, `src/db/redis.ts`.
- Convenciones de claves:
  - `otp:{email}` → string, TTL 300s.
  - `user:{userId}:history` → lista, `LPUSH` + `LTRIM 0 9` para mantener los últimos 10.

**Entregable:** migraciones aplicadas, conexiones a las 3 bases de datos verificadas con un script de smoke-test.

---

## Fase 3 — Backend API (Fastify)

### Estructura de carpetas propuesta

```
backend/src/
  db/            # prisma.ts, mongo.ts, redis.ts
  plugins/       # jwt.ts, cors.ts
  modules/
    auth/        # rutas + servicios OTP y Google OAuth
    usuarios/    # perfil, historial
    inmuebles/   # CRUD + listado combinado (Postgres + Mongo)
  utils/         # validación Zod, helpers
  server.ts
```

### Autenticación (Passwordless)

- `POST /auth/otp/request`
  - Body: `{ email }`.
  - Genera código de 6 dígitos aleatorio.
  - `SET otp:{email} <codigo> EX 300` en Redis.
  - "Envía" el código con `console.log` (placeholder claramente marcado para reemplazar por Resend/Nodemailer más adelante).
- `POST /auth/otp/verify`
  - Body: `{ email, codigo }`.
  - Compara contra `GET otp:{email}`.
  - Si coincide: borra la clave (`DEL`), busca o crea el `Usuario` por email, firma JWT (`@fastify/jwt`) y lo retorna.
- `POST /auth/google`
  - Body: `{ idToken }` (token de Google recibido desde el frontend).
  - Verifica el token con `google-auth-library` contra el Client ID configurado.
  - Busca usuario por `googleId`/`email`; si no existe, lo crea; retorna JWT.
  - **Pendiente del usuario:** crear proyecto en Google Cloud Console → habilitar "Google Identity Services" → generar OAuth Client ID (tipo Web) → configurar orígenes autorizados (`http://localhost:5173` en dev) → guardar `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` en `.env`. Se documentará el paso a paso exacto como checklist en el README del backend.

### Middleware / protección de rutas

- Plugin `@fastify/jwt` + hook `preHandler` que valida el JWT y expone `request.user`.

### CRUD Usuarios

- `GET /usuarios/perfil` — retorna datos del usuario autenticado.
- `PUT /usuarios/perfil` — actualiza campos opcionales (zonas de interés, presupuesto, teléfono, etc.), validado con Zod.

### CRUD Inmuebles

- `POST /inmuebles` — crea inmueble propio vinculado al `usuarioId` del JWT.
- `GET /inmuebles` — lista combinando resultados de Postgres (propios) y MongoDB (scrapeados), con filtros comunes (rango de precio, zona, habitaciones, etc.) normalizados en la capa de servicio.
- `PUT /inmuebles/:id` — actualiza, solo si pertenece al usuario autenticado.
- `DELETE /inmuebles/:id` — elimina, solo si pertenece al usuario autenticado.

### Historial (Redis)

- `POST /usuarios/historial` — recibe `inmuebleId`, hace `LPUSH` + `LTRIM 0 9` en `user:{userId}:history`.
- `GET /usuarios/historial` — hace `LRANGE user:{userId}:history 0 9` y resuelve los detalles de cada inmueble (buscando en Postgres o Mongo según corresponda).

**Entregable:** API corriendo localmente, endpoints probados vía REST client (`.http` file o Postman collection incluida), validación con Zod en todos los bodies.

---

## Fase 4 — Frontend (esqueleto)

Dado que las instrucciones se enfocan en backend/datos, el frontend en esta fase queda como esqueleto mínimo:

1. Setup de Vite + React + TS + Tailwind (ya cubierto en Fase 1).
2. Estructura básica de carpetas (`src/pages`, `src/components`, `src/lib/api.ts` con cliente HTTP tipado).
3. Página de login con dos flujos: input de email + input de OTP, y botón de Google (usando `@react-oauth/google` para obtener el `idToken` y enviarlo a `POST /auth/google`).
4. Layout base y ruteo (`react-router`) — placeholder de páginas: Login, Perfil, Listado de Inmuebles.

**Entregable:** app compilando y sirviendo, con el flujo de login conectado al backend real.

---

## Fase 5 — Scraper (Python, gestionado con uv)

1. Inicializar el proyecto con `uv init scraper` (genera `pyproject.toml`, `.python-version`).
2. `uv add playwright beautifulsoup4 pymongo apscheduler pydantic` para declarar dependencias (quedan fijadas en `uv.lock`).
3. Script `scraper/main.py`:
   - Función `scrape_mock()` que genera datos estáticos simulando inmuebles de portales (`fincaraiz`, `metrocuadrado`).
   - Inserta/actualiza (`upsert` por `urlOriginal`) en la colección `inmuebles_scrapeados` de MongoDB vía `pymongo`.
4. Scheduler con `APScheduler` (`BackgroundScheduler`, `interval, hours=3`) ejecutando la tarea de scraping.
5. Ejecución local con `uv run python main.py` (uv resuelve el entorno virtual automáticamente, sin pasos manuales de `venv`/`pip install`).
6. Estructura pensada para que, en una fase posterior, `scrape_mock()` se reemplace por scrapers reales por portal (`scrapers/fincaraiz.py`, `scrapers/metrocuadrado.py`) sin tocar el scheduler.

**Entregable:** worker corriendo standalone (`uv run python main.py`), insertando datos mock en Mongo cada 3 horas (verificable bajando el intervalo a segundos en dev).

---

## Orden de ejecución sugerido

1. Fase 1 (estructura + Docker Compose) — base para todo lo demás.
2. Fase 2 (esquemas Prisma + conexiones Mongo/Redis).
3. Fase 3 (API completa: auth, usuarios, inmuebles, historial).
4. Fase 5 (scraper) — puede correr en paralelo a Fase 3 ya que solo depende de Mongo.
5. Fase 4 (frontend) — al final, para conectar contra una API ya funcional.

## Pendientes que requieren acción del usuario

- Crear credenciales de Google OAuth2 (Client ID + Secret) en Google Cloud Console.
- Decidir más adelante el proveedor real de email (Resend/Nodemailer + SMTP) cuando se quiera reemplazar el log en consola.
- Definir el dominio/hosting de la única instancia cuando se pase a despliegue (fuera de alcance de esta fase).
