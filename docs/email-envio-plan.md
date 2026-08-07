# Envío real de emails (Resend)

## Contexto

Todos los emails del backend hoy son `console.log` stubs, marcados como pendientes en `AGENTS.md`. Hay 3 puntos de envío existentes y falta un 4to que el propio AGENTS.md prometía pero nunca se implementó:

1. `backend/src/modules/auth/auth.routes.ts:84` — OTP de login (`POST /auth/otp/request`)
2. `backend/src/modules/auth/auth.routes.ts:173` — OTP de recuperación de cuenta (`POST /auth/cuenta/recuperar`)
3. `backend/src/modules/usuarios/usuarios.routes.ts:181-183` — aviso de borrado programado (`DELETE /usuarios/perfil`)
4. **Nuevo**: confirmación de reactivación (`POST /auth/cuenta/recuperar/confirmar`, líneas 339-360) — AGENTS.md lo menciona como pendiente pero el endpoint no tiene ni TODO ni stub hoy.

Decisiones ya tomadas con el usuario:
- Proveedor: **Resend**.
- Si el envío falla, los 3 flujos existentes (pedir OTP, pedir recuperación, borrar cuenta) deben **bloquear** — el endpoint responde error, no éxito silencioso.
- Para la confirmación de reactivación (nueva, no cubierta en la pregunta original) propongo **best-effort**: en ese punto la cuenta ya fue reactivada y el usuario ya probó posesión de la cuenta (OTP o Google) — bloquear la respuesta por un email informativo dejaría al usuario sin acceso pese a haber demostrado ser el dueño. Se loguea el error pero la reactivación sigue devolviendo éxito + JWT.

## Cambios

### 1. Dependencia y config
- `backend/package.json`: agregar `resend`.
- `backend/.env.example`: agregar `RESEND_API_KEY`, `EMAIL_FROM` (remitente verificado), `FRONTEND_URL` (para el link de recuperación en el aviso de borrado — hoy no hay una URL base del frontend en ningún `.env`).
- El usuario deberá crear una cuenta en resend.com y poner su API key real en `backend/.env` (no lo hace Claude). Nota para pruebas: sin dominio verificado, Resend solo permite enviar al email con el que te registraste usando `onboarding@resend.dev` como remitente — para probar con otros destinatarios hace falta verificar un dominio propio.

### 2. `backend/src/email/mailer.ts` (nuevo)
Sigue la convención de `backend/src/db/{redis,mongo,prisma}.ts` (módulo standalone, cliente singleton exportado, sin inyección vía Fastify). Contenido:
- `const resend = new Resend(process.env.RESEND_API_KEY)` — falla rápido al importar si falta la env var (mismo patrón que `prisma.ts` con `DATABASE_URL`).
- Una función interna `sendEmail({ to, subject, html, text })` que llama `resend.emails.send(...)` y **lanza** si `error` viene en la respuesta (el SDK de Resend no throwea solo, devuelve `{ data, error }`).
- 4 funciones específicas, una por caso de uso, cada una arma su propio asunto/HTML/texto simple (sin motor de templates, strings inline):
  - `sendLoginOtpEmail(email, codigo)`
  - `sendAccountRecoveryOtpEmail(email, codigo)`
  - `sendAccountDeletionScheduledEmail(email, eliminacionProgramadaEn, recoveryUrl)`
  - `sendAccountReactivatedEmail(email)`

### 3. Wiring en las rutas

**`auth.routes.ts` `POST /otp/request`**: tras el `setex`, `await sendLoginOtpEmail(email, codigo)` dentro de un try/catch; si falla, `redisClient.del` del OTP recién guardado y responder `502` con mensaje genérico.

**`auth.routes.ts` `POST /cuenta/recuperar`**: mismo patrón, solo dentro del `if (isRecoverableAccount(...))`. Si el envío falla, limpiar el `recoveryOtpKey` y responder error.

**`usuarios.routes.ts` `DELETE /usuarios/perfil`**: invertir el orden actual — calcular `programado`, intentar `sendAccountDeletionScheduledEmail(...)` primero, y solo si el envío tiene éxito ejecutar el `updateMany` que marca `eliminadoEn`/`eliminacionProgramadaEn`. Si falla, responder `502` sin tocar la cuenta.

**`auth.routes.ts` `POST /cuenta/recuperar/confirmar`**: después de construir el nuevo JWT y antes del `return`, `sendAccountReactivatedEmail(usuario.email).catch(...)` — best-effort, no bloquea la respuesta.

### 4. Documentación
Actualizar la sección "Account deletion & recovery" de `AGENTS.md`: quitar la nota de "Today those emails are stubbed..." y reemplazar por una descripción breve de que Resend ya está integrado.

## Verificación

1. `pnpm --filter backend exec tsc --noEmit` — typecheck limpio.
2. Con `RESEND_API_KEY` real en `backend/.env`: probar en vivo con `backend/test/api.http` cada uno de los 4 flujos.
3. Revisar que ninguna plantilla exponga datos sensibles de más (nunca el JWT ni tokens de recuperación).
