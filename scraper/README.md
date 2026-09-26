# Scraper — Rentia

Scraper de portales de arriendo para Bogotá. Persiste en MongoDB (colección
`inmuebles_scrapeados`) y se ejecuta cada 3 horas con APScheduler.

## Portales

**Fincaraiz** (`/arriendo/...`). Se parsea el JSON embebido en `__NEXT_DATA__`
de las páginas de listado, que ya contiene todos los campos requeridos
(precio, administración, estrato, piso, parqueaderos, antigüedad, lat/lng,
descripción y facilities para ascensor/patio/mascotas). No requiere visitar
páginas de detalle.

La paginación es **por path** (`…/bogota-dc/pagina2`); el query param
`?pagina=N` es ignorado por el servidor. La página 1 es la URL base sin
sufijo.

Antes de navegar se consulta `robots.txt` y se rechazan rutas no permitidas,
con rate limiting conservador (delays 2–5 s). Las URLs configuradas deben ser
HTTPS y no llevar query ni fragmento.

**Metrocuadrado** (`/inmuebles/...`) usa el API `rest-search/search` desde su
frontend Next.js. El scraper abre primero el listado con Playwright y ejecuta
el API dentro del mismo contexto con `X-Api-Key`, guardando la respuesta de
listado en Mongo. La paginación es por offset (`from`/`size`) y el cursor se
persiste como `cursor:metrocuadrado`. Los inmuebles nuevos se visitan también
en `/inmueble/...` para extraer coordenadas exactas, estrato, piso,
antigüedad, administración y características. Si el detalle falla, se
conservan los datos del listado. Un detalle que ya no existe (404/410 o
redirección dentro del sitio) se omite sin detener el resto; cada detalle
visitado o con 404/410 queda marcado con `detalleIntentadoEn` para no
revisitarlo en cada corrida aunque no traiga datos. Una redirección no se
marca (podría ser un captcha) y se reintenta en la próxima corrida; tres
redirecciones seguidas detienen el enrich como un bloqueo.

La API actual requiere `size=50` para devolver resultados. Los filtros se envían
explícitamente como `realEstateTypeList`, `realEstateBusinessList` y `city`;
esto permite que `from` avance correctamente entre corridas.

La ruta nueva `/inmuebles/...` está permitida por el `robots.txt` actual del
portal. El endpoint de resultados limita `totalEntries` a 10.000; ese valor es
el límite efectivo del barrido.

## Estructura

```
main.py                 # entry point + scheduler
config.py               # variables desde .env
models.py               # InmuebleScraped (pydantic)
db.py                   # Mongo: índice único, upsert bulk, marcar inactivos
utils/parsing.py        # normalización de números/precios/áreas
scrapers/
  base.py               # Playwright + extracción con retry/delay
  fincaraiz.py          # listado + mapeo a InmuebleScraped
  metrocuadrado.py      # API de listado + enrich desde páginas de detalle
```

## Setup

```bash
cp .env.example .env            # ajusta Mongo y URLs de búsqueda
uv run playwright install chromium
```

## Ejecución

```bash
uv run python main.py           # corrida inmediata + scheduler cada 3h
```

Para una prueba rápida, baja `MAX_PAGINAS=1` en `.env`.

Variables principales (ver `.env.example`):

| Variable | Default | Descripción |
|---|---|---|
| `FINCARAIZ_BASE_URL` | `…/arriendo/apartamentos/bogota-dc` | URL de búsqueda canónica |
| `MAX_PAGINAS` | `5` | Páginas por corrida (~21 inmuebles/página) |
| `DELAY_MIN_S` / `DELAY_MAX_S` | `2` / `5` | Delay aleatorio entre requests |
| `SCRAPE_INTERVAL_HOURS` | `3` | Intervalo del scheduler |
| `HEADLESS` | `true` | `false` para ver el navegador |
| `INACTIVE_AFTER_DAYS` | `14` | Días sin reaparecer antes de marcar inactivo. Debe superar el período de barrido (ver abajo) |
| `MIN_ITEMS_PER_RUN` | `10` | Mínimo de items válidos antes de confirmar una corrida |
| `MIN_MAPPED_RATIO` | `0.25` | Proporción mínima de items mapeados frente a items recibidos |
| `SCRAPE_LEASE_TTL_S` | `21600` | Duración del lease contra dos procesos concurrentes |
| `MAX_CANON_S` / `MAX_AREA_M2` | `50000000` / `2000` | Límites para descartar outliers |
| `METROCUADRADO_BASE_URL` | `…/inmuebles/arriendo/apartamentos/bogota/` | URL canónica de búsqueda |
| `METROCUADRADO_SEARCH_URL` | `…/rest-search/search` | API de resultados |
| `METROCUADRADO_API_KEY` | clave pública del portal | Header `X-Api-Key` |
| `METROCUADRADO_ENRICH_DETAILS` | `true` | Visitar detalles de anuncios nuevos |
| `METROCUADRADO_MAX_DETAIL_ITEMS` | `50` | Máximo de detalles por corrida |

## Rotación de ventana (cursor)

Cada corrida cubre `MAX_PAGINAS` páginas. Para no scrapear siempre las mismas,
la ventana **rota entre corridas**: el punto de arranque se persiste en Mongo
(`scraper_meta`). Fincaraiz guarda la página (`cursor:fincaraiz`); Metrocuadrado
guarda el offset `from` (`cursor:metrocuadrado`). Ambos envuelven al inicio al
llegar al final del listado.

El período de barrido se calcula con el `lastPage` informado por el portal.
Si una corrida se corta (bloqueo, paginación inconsistente o, en
Metrocuadrado, una página vacía antes del total informado), se guardan las
páginas válidas y el cursor avanza hasta la primera página u offset que falló,
pero no se marcan inmuebles como inactivos. Si la corrida pierde el lease, el
cursor no se toca: otro proceso lo está rotando.

## Inmuebles despublicados

Cada corrida actualiza `fechaScraping` de lo que ve, y al final se marcan
`activo: false` (nunca se borran) los documentos cuyo `fechaScraping` lleva
más de `INACTIVE_AFTER_DAYS` sin refrescarse. El backend filtra
`activo: { $ne: false }`.

**Invariante:** `INACTIVE_AFTER_DAYS` debe ser mayor que el período de
barrido completo (`ceil(lastPage / MAX_PAGINAS) × SCRAPE_INTERVAL_HOURS / 24`
días). Si no, se desactivan inmuebles publicados justo antes de volver a
verlos. El scraper loguea un warning si la configuración viola este
invariante.

## Identidad y dedupe

La clave única es `id` (`fincaraiz-<externalId>` o
`metrocuadrado-<midinmueble>`), estable ante cambios de slug. `urlOriginal`
tiene índice no único: los portales pueden cambiar el slug
del mismo inmueble (p. ej. `…-cedritos-bogota` → `…-cedritos-zona-norte-bogota`),
y upsertar por URL crearía duplicados. Las URLs y descripciones se validan y
las descripciones se limpian de correos y teléfonos antes de persistirlas.
