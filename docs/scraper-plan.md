# Plan — Scraper real de Rentia (Fincaraiz → MongoDB)

## Decisiones tomadas

| Aspecto | Decisión |
|---|---|
| Portal inicial | Solo **Fincaraiz** (robots.txt lo permite, sitemaps públicos, sin anti-bot agresivo) |
| Profundidad | **Solo listado** — el `__NEXT_DATA__` del SSR ya trae todos los campos (estrato, administración, lat/lng, descripción, facilities). No se visita el detalle. |
| Volumen | Ventana **rotativa** con cursor persistido en Mongo (`scraper_meta`), `MAX_PAGINAS=5` por corrida (~105 inmuebles; 21 por página) |
| Despublicados | Flag `activo: false` por **antigüedad** (`fechaScraping` > `INACTIVE_AFTER_DAYS=14` sin refrescarse), nunca por "no visto en esta corrida". El backend filtra `activo != false` |
| Metrocuadrado | **Pospuesto** — bloquea `/metrocuadrado-results/` en robots.txt y usa Incapsula |

## Estructura propuesta (`scraper/`)

```
scraper/
  main.py                  # Entry point: corrida inicial + APScheduler (3h)
  config.py                # Carga .env, constantes (MONGO_URL, MAX_PAGINAS, delays)
  models.py                # InmuebleScraped (pydantic) — espejo del schema Mongo
  db.py                    # Conexión Mongo, upsert bulk, índice único urlOriginal, marcar inactivos
  scrapers/
    __init__.py
    base.py                # Clase base: browser Playwright, fetch con retry/delay/jitter
    fincaraiz.py           # FincaraizScraper: listado + detalle + normalización
  utils/
    parsing.py             # parse_precio("$1.500.000"), parse_area("45 m²"), parse_texto_int, etc.
```

## Modelo de datos (pydantic, `models.py`)

Espejo de lo que el backend ya lee de `inmuebles_scrapeados`, con campos no garantizados como opcionales:

- Requeridos: `id` (=`f"fincaraiz-{externalId}"`), `portalOrigen`, `urlOriginal`, `valorCanon`, `tamanoM2`, `habitaciones`, `banos`, `fechaScraping`, `activo`
- Opcionales: `valorAdministracion`, `estrato`, `piso`, `antiguedadAnos`, `latitud`, `longitud`, `descripcion`, `administracionIncluida`
- Defaults: `patio=false`, `parqueaderos=0`, `ascensor=false`, `petFriendly=false`
- Validadores: rangos de negocio, coordenadas, tipos numéricos y URL HTTP(S) absoluta

## Fases de implementación

### Fase 0 — Setup
1. `uv run playwright install chromium` (dependencia ya declarada, falta el browser).
2. Ampliar `.env.example`: `MONGO_URL`, `FINCARAIZ_BASE_URL`, `MAX_PAGINAS=5`, `DELAY_MIN_S=2`, `DELAY_MAX_S=5`, `SCRAPE_INTERVAL_HOURS=3`, `HEADLESS=true`.
3. README del scraper con instrucciones de corrida.

### Fase 1 — Persistencia (`db.py`)
1. Cliente Mongo singleton; colección `arriendaya_scraper.inmuebles_scrapeados`.
2. Índice **único en `id`** (estable ante cambios de slug); `urlOriginal` queda con índice no único (Fincaraiz cambia slugs del mismo inmueble).
3. `upsert_inmuebles(docs)`: dedupe por `id` + `bulk_write` con `UpdateOne({id}, $set, upsert=True)`; retorna conteos nuevos/actualizados.
4. `marcar_inactivos(portal, corte)`: `update_many({portalOrigen, fechaScraping: {$lt: corte}, activo: true}, {$set: {activo: false}})`.
5. Cursor de rotación en colección `scraper_meta` (`get_cursor`/`set_cursor`, doc `cursor:fincaraiz` con `nextPage`/`lastPage`).

### Fase 2 — Scraper Fincaraiz: listado
1. Inspección manual previa (en ejecución): confirmar URL de búsqueda de arriendos Bogotá y **buscar `__NEXT_DATA__`** (Fincaraiz es Next.js; el JSON embebido es mucho más robusto que selectores CSS).
2. De cada tarjeta: `urlOriginal`, `externalId`, precio, m², habitaciones, baños, ubicación aproximada.
3. **Paginación por path** (`…/bogota-dc/pagina2` — el query param `?pagina=N` es ignorado por el servidor). La página de arranque viene del cursor persistido; cada corrida cubre `MAX_PAGINAS` páginas y avanza el cursor (envuelve a 1 al llegar a `lastPage`). El período de barrido se calcula con el `lastPage` real; **`INACTIVE_AFTER_DAYS` debe superar el barrido** — el scraper loguea warning si no.
4. Delay aleatorio `DELAY_MIN_S–DELAY_MAX_S` entre requests y User-Agent realista.
5. Detección de bloqueo: se consulta `robots.txt` antes de navegar y, si la respuesta es 4xx/captcha o la paginación no coincide, se aborta limpiamente y se loggea (el cursor queda en la última página traída con éxito).
6. Un item que falla al mapear se loguea y descarta **sin abortar la corrida** (try/except por item + `try/finally` para cerrar browser/context), pero una corrida con pocos items válidos o demasiados descartes no confirma cursor ni inactividad.

### Fase 3 — Scraper Fincaraiz: detalle (DESCARTADA)
Tras inspeccionar el sitio, el `__NEXT_DATA__` de la página de **listado** ya
contiene el objeto completo de cada inmueble (incluye `stratum`, `floor`,
`commonExpenses`, `latitude/longitude`, `facilities` para ascensor/patio,
`technicalSheet` con antigüedad/mascotas, `description`, jerarquía de
`locations`). No se necesita visitar el detalle: una sola petición por página
resuelve todo. `scrapers/fincaraiz.py` lee `props.pageProps.fetchResult.searchFast.data`
y mapea cada item a `InmuebleScraped`. Un inmueble que falla validación se
descarta con `log.warning` (no tumba la corrida).

### URL confirmada
La URL canónica de apartamentos en arriendo en Bogotá es
`https://www.fincaraiz.com.co/arriendo/apartamentos/bogota-dc`
(slug de ciudad `bogota-dc`, tipo `apartamentos` en plural; `/arriendo/apartamento/bogota`
se resuelve a otra ubicación y NO sirve). El volumen se toma del `lastPage`
actual de la respuesta, no de una cifra fija en la documentación.

### Fase 4 — Orquestación (`main.py`)
1. `run_scrape()`: listado → detalles → upsert → `marcar_inactivos` → resumen en log (nuevos/actualizados/desactivados/errores).
2. Try/except por inmueble y por página; reintentos con backoff simple (2 intentos) solo para errores de red.
3. `scrape_mock()` se elimina; `main.py` ejecuta `run_scrape()` al iniciar y luego APScheduler cada `SCRAPE_INTERVAL_HOURS` con `max_instances=1` (evita corridas solapadas).

### Fase 5 — Ajuste en backend (mínimo)
1. En `backend/src/modules/inmuebles/inmuebles.routes.ts`: agregar `activo: { $ne: false }` al query de Mongo para no servir despublicados.
2. Actualizar `AGENTS.md` (sección scraper) con la nueva estructura.

### Fase 6 — Verificación
1. Corrida manual con `MAX_PAGINAS=1` (`uv run python main.py`), inspeccionar documentos en Mongo (compass o `mongosh`).
2. Corrida completa con el tope por defecto; verificar: sin duplicados (índice único), campos completos, flag `activo` correcto en una segunda corrida.
3. Verificar que `GET /inmuebles` del backend devuelve los scrapeados junto a los propios.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Fincaraiz cambia el HTML / `__NEXT_DATA__` | Extracción centralizada en `fincaraiz.py`; logs y umbral de calidad cuando una corrida trae pocos resultados válidos |
| Bloqueo de IP | Delays 2–5s, UA realista, tope de páginas, abortar ante 403. Si escala: proxies residenciales (fuera de alcance MVP) |
| Datos faltantes (estrato no publicado, etc.) | Campos opcionales en pydantic; el backend ya tolera documentos sin ellos |
| Corridas solapadas si una tarda >3h | `max_instances=1` + `coalesce=True` en APScheduler y lease persistido en Mongo |

## Nota legal/ética
Se consulta y respeta `robots.txt` de Fincaraiz antes de navegar, con rate limiting conservador. Metrocuadrado queda fuera precisamente porque su robots.txt prohíbe la ruta de resultados.

## Fuera de alcance (futuras fases)
- Metrocuadrado u otros portales (la interfaz `scrapers/base.py` ya lo permite: `class MetrocuadradoScraper(BaseScraper)`).
- Proxies, rotación de UA, captcha solving.
- ~~Scraping de imágenes~~ — hecho: `InmuebleScraped.imagenes` guarda hasta 10 URLs
  del CDN (`item.images[].image` + portada en `item.img`). Ver AGENTS.md.
