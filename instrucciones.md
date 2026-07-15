Actúa como un Arquitecto de Software Senior y Desarrollador Full-stack. Vamos a construir el Core MVP de "ArriendaYa", un agregador y portal de arriendos para Bogotá. 

Tu objetivo en esta fase es estructurar el proyecto completo utilizando una arquitectura simplificada pero modular (corriendo inicialmente en una sola instancia/servidor para evitar sobrecostos y complejidad, pero lista para escalar).

---

### 🛠️ STACK TECNOLÓGICO Y ARQUITECTURA
1. FRONTEND: Vite + React + TypeScript + Tailwind CSS (Componente único de presentación).
2. BACKEND API: Node.js con Fastify (TypeScript). Centralizará la lógica de usuarios y de inmuebles propios para simplificar el arranque.
3. WORKER DE SCRAPING: Python (con un scheduler/cron interno para ejecutarse cada 3 horas de forma asíncrona).
4. BASES DE DATOS (Corriendo en una misma instancia/host):
   - PostgreSQL: Para datos estructurados (Usuarios e Inmuebles propios).
   - MongoDB: Para almacenar los datos semiestructurados recolectados por el scraper.
   - Redis: Para almacenar:
     - Historial de últimos 10 vistos.
     - Códigos OTP temporales de inicio de sesión (con tiempo de expiración TTL de 5 minutos).

---

### 🔐 FLUJO DE AUTENTICACIÓN (PASSWORDLESS)
No utilizaremos contraseñas tradicionales. Implementaremos dos métodos de login:
1. OTP via Email:
   - El usuario ingresa su email.
   - El backend genera un código de 6 dígitos aleatorio, lo almacena en Redis (`otp:{email}` con TTL de 5 minutos) y lo envía al usuario por email (simulado con logs en consola o usando un servicio como Nodemailer / Resend).
   - El usuario ingresa el código. El backend lo valida contra Redis y, si es correcto, genera y retorna un JWT (JSON Web Token).
2. Social Login (Google OAuth2):
   - Integración frontend-backend para validar el token de Google y registrar/iniciar sesión al usuario directamente si el email es válido.

---

### 🗄️ MODELADO DE DATOS (ESQUEMAS)

Debes diseñar e implementar los siguientes esquemas de datos:

1. USUARIOS (PostgreSQL):
   - id: UUID / Serial PK
   - email: String (Único, requerido)
   - zonas_interes: TEXT[] (Array nativo de Postgres para guardar códigos de UPZ de Bogotá)
   - edad: Integer (Opcional)
   - ciudad_origen: String (Opcional)
   - telefono: String (Opcional)
   - presupuesto_min: Decimal/Numeric (Opcional)
   - presupuesto_max: Decimal/Numeric (Opcional)
   - google_id: String (Opcional, para vinculación de cuenta social)
   - fecha_creacion: Default NOW()

2. INMUEBLES PROPIOS (PostgreSQL - Posteos de usuarios):
   - id: UUID / Serial PK
   - usuario_id: FK (Relación con Usuarios)
   - valor_canon: Decimal/Numeric (Requerido)
   - administracion_incluida: Boolean (Requerido)
   - valor_administracion: Decimal/Numeric (Opcional)
   - tamano_m2: Integer (Requerido)
   - habitaciones: Integer (Requerido)
   - banos: Integer (Requerido)
   - patio: Boolean (Default false)
   - parqueaderos: Integer (Default 0)
   - antiguedad_anos: Integer
   - estrato: Integer (Rango de 1 a 6, requerido en Colombia)
   - piso: Integer
   - ascensor: Boolean
   - pet_friendly: Boolean (Default false)
   - latitud: Double/Decimal
   - longitud: Double/Decimal
   - url: String (Opcional para posts propios)

3. INMUEBLES SCRAPEADOS (MongoDB):
   - Debe replicar la estructura de PostgreSQL agregando campos específicos de integración:
     - portal_origen: String (ej: 'fincaraiz', 'metrocuadrado')
     - url_original: String (Requerido, para redirección directa)
     - fecha_scraping: Date (Default ahora)

4. REDIS (Datos temporales / Caché):
   - OTP: Clave `otp:{email}` -> Valor: `código_6_dígitos` (Expiración: 300 segundos)
   - Historial de Vistos: Tipo LIST. Clave: `user:{userId}:history`. Cada vez que un usuario consulte un inmueble, se hace un LPUSH del ID del inmueble consultado y un LTRIM para mantener estrictamente los últimos 10 vistos.

---

### 🚀 TAREAS DE ESTA PRIMERA FASE (PASO A PASO)

Paso 1: Estructura del Monorepo / Workspace
- Crea una carpeta raíz `/arriendaya` con:
  - `/frontend` (Vite + React + TS + Tailwind)
  - `/backend` (Fastify + Prisma/Sequelize como ORM)
  - `/scraper` (Python + dependencias como Playwright/BeautifulSoup y pymongo)

Paso 2: Configuración de Base de Datos y Esquemas
- Configura las migraciones de PostgreSQL mapeando correctamente el array de UPZs y los campos opcionales del usuario.
- Configura las conexiones de cliente para MongoDB y Redis en el Backend.

Paso 3: Esqueleto del API en Fastify (Rutas Clave)
- Implementar endpoints de Autenticación:
  - `POST /auth/otp/request` (Genera código, lo guarda en Redis con TTL, y lo envía/imprime en log).
  - `POST /auth/otp/verify` (Valida código contra Redis y genera JWT).
  - `POST /auth/google` (Valida credenciales de Google OAuth y genera JWT).
- Implementar endpoints CRUD:
  - `GET/PUT /usuarios/perfil` (Ruta protegida con JWT para ver/actualizar datos del usuario logueado).
  - `POST/GET/PUT/DELETE /inmuebles` (Crear publicación propia vinculada al JWT, listar y filtrar combinando DB local y MongoDB).
  - `GET/POST /usuarios/historial` (Endpoints para añadir a la lista de Redis y consultar los últimos 10 vistos).

Paso 4: Esqueleto del Scraper en Python
- Script básico de simulación (puedes usar datos estáticos/mock por ahora) que guarde en MongoDB.
- Tarea programada usando un scheduler (como `APScheduler` o `schedule` de Python) configurado para ejecutarse cada 3 horas.

Por favor, genera el plan para llevar a cabo este proyecto y dejalo en un documento de markdown