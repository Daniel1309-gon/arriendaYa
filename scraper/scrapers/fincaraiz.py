import logging
import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable
from urllib.parse import urljoin, urlparse

from playwright.sync_api import sync_playwright

from config import MAX_AREA_M2, MAX_CANON_S
from models import InmuebleScraped
from utils.parsing import first_int, to_bool, to_float, to_int

from .base import BaseScraper, BlockedException

log = logging.getLogger("scraper")

BASE = "https://www.fincaraiz.com.co"
ASCENSOR_KEYWORDS = ("ascensor",)
PATIO_KEYWORDS = ("patio",)
PET_KEYWORDS = ("mascota",)
ALLOWED_HOSTS = {"fincaraiz.com.co", "www.fincaraiz.com.co"}
EMAIL_RE = re.compile(r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b")
PHONE_RE = re.compile(
    r"(?<!\d)(?:\+?57[\s-]?)?3\d{2}[\s-]?\d{3}[\s-]?\d{4}(?!\d)"
)


@dataclass(frozen=True)
class ScrapeResult:
    docs: list[dict]
    completa: bool
    next_page: int
    last_page: int | None
    pages_fetched: int
    raw_items: int
    mapped_items: int
    aborted: bool
    abort_reason: str | None = None

    def __iter__(self):
        """Mantiene compatible la desestructuración histórica de cuatro valores."""
        yield self.docs
        yield self.completa
        yield self.next_page
        yield self.last_page


def _technical_sheet_dict(item: dict) -> dict:
    sheet = item.get("technicalSheet") if isinstance(item, dict) else None
    out: dict[str, str] = {}
    if not isinstance(sheet, list):
        return out
    for row in sheet:
        if not isinstance(row, dict):
            continue
        field = row.get("field")
        if field:
            out[field] = row.get("value")
    return out


def _loc_name(loc_value, key: str) -> str | None:
    if not isinstance(loc_value, dict):
        return None
    entries = loc_value.get(key)
    if isinstance(entries, list) and entries:
        first = entries[0]
        if isinstance(first, dict):
            return first.get("name")
    return None


def _slugify(text: str | None) -> str:
    if not text:
        return ""
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii").lower()
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def _safe_listing_url(link) -> str | None:
    if not isinstance(link, str) or not link.strip():
        return None
    url = urljoin(BASE, link.strip())
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS:
        return None
    return url


def _sanitize_description(value) -> str | None:
    if not isinstance(value, str):
        return None
    description = value.strip()
    if not description:
        return None
    description = EMAIL_RE.sub("[contacto omitido]", description)
    description = PHONE_RE.sub("[contacto omitido]", description)
    return description[:2000]


def _antiguedad_anios(sheet: dict) -> int | None:
    raw_year = sheet.get("constructionYear")
    number = first_int(raw_year)
    current_year = datetime.now(timezone.utc).year
    if number is not None and 1900 <= number <= current_year:
        return current_year - number
    if number is not None and 0 <= number <= 200:
        return number
    for key in ("age", "constructionAge", "antiquity"):
        age = first_int(sheet.get(key))
        if age is not None and 0 <= age <= 200:
            return age
    return None


def _imagenes(item: dict) -> list[str]:
    """URLs de las fotos del anuncio, portada primero.

    El payload trae la galería en `images` (lista de {id, image, tag}) y repite
    la portada en `img`; se antepone `img` para que la card no dependa del
    orden de la galería. Se guarda la resolución original tal como la da el
    portal: el thumbnail se deriva en el frontend insertando `th.outside{W}x{H}.`
    después de /repo/img/, así el detalle puede pedir la grande sin re-scrapear.

    No filtra nada: el saneo (https, host permitido, dedupe, tope de 10) vive en
    InmuebleScraped._imagenes, que es quien también protege a los documentos que
    ya están en Mongo.
    """
    urls: list[str] = []
    portada = item.get("img")
    if isinstance(portada, str):
        urls.append(portada)
    galeria = item.get("images")
    if isinstance(galeria, list):
        for entrada in galeria:
            url = entrada.get("image") if isinstance(entrada, dict) else entrada
            if isinstance(url, str):
                urls.append(url)
    return urls


def _barrio(locations: dict, link: str | None) -> str | None:
    """Elige el barrio cuyo nombre aparece en el slug de la URL del anuncio.

    El match es por segmento completo ("-santa-barbara-occidental-" dentro de
    "-{link_slug}-") para que "Belén" no matchee "belencito" ni "Santa
    Bárbara" gane sobre "Santa Bárbara Occidental". Entre varios matches
    gana el nombre más largo (el más específico). Si ninguno matchea, se cae
    al primero (comportamiento anterior).
    """
    if not isinstance(locations, dict):
        return None
    entries = locations.get("neighbourhood")
    if not isinstance(entries, list) or not entries:
        return None
    names = [
        e.get("name")
        for e in entries
        if isinstance(e, dict) and isinstance(e.get("name"), str) and e.get("name")
    ]
    if not names:
        return None
    link_slug = _slugify(link)
    if link_slug:
        haystack = f"-{link_slug}-"
        matches = [n for n in names if f"-{_slugify(n)}-" in haystack]
        if matches:
            return max(matches, key=lambda n: len(_slugify(n)))
    return names[0]


class FincaraizScraper(BaseScraper):
    portal = "fincaraiz"

    def page_url(self, page_number: int) -> str:
        # Paginación por path: /arriendo/.../bogota-dc/pagina2. El query
        # param ?pagina=N es ignorado por el servidor (siempre devuelve la
        # página 1); la página 1 es la URL base sin sufijo.
        if page_number <= 1:
            return self.base_url
        return f"{self.base_url.rstrip('/')}/pagina{page_number}"

    def scrape(
        self,
        start_page: int = 1,
        before_page: Callable[[], bool] | None = None,
    ) -> ScrapeResult:
        """Recorre hasta max_paginas páginas empezando en start_page.

        La ventana rota entre corridas (el cursor lo persiste main.py en
        Mongo): con un listado de N páginas, corridas sucesivas cubren
        rangos distintos hasta barrer el catálogo completo y envolver a 1.

        Devuelve un ScrapeResult (compatible con la desestructuración histórica
        de docs, completa, next_page y last_page):
        - next_page: página desde la que arranca la próxima corrida
          (última página traída + 1, o 1 si se llegó al final del listado).
          Si no se pudo traer ninguna página (bloqueo inmediato), es igual
          a start_page para reintentar el mismo rango.
        - last_page: última página del listado según paginatorInfo, o None
          si no se pudo determinar.
        - completa: True sólo si el recorrido llegó al final real del
          listado (última página o página vacía). Informativo.
        """
        docs: list[dict] = []
        completa = False
        last_page: int | None = None
        last_ok = 0
        pages_fetched = 0
        raw_items = 0
        mapped_items = 0
        pagina = max(1, start_page)
        aborted = False
        abort_reason: str | None = None
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=self.headless)
            try:
                context = browser.new_context(
                    user_agent=self.user_agent, locale="es-CO"
                )
                try:
                    page = context.new_page()
                    while pages_fetched < self.max_paginas:
                        if before_page is not None and not before_page():
                            aborted = True
                            abort_reason = "se perdió el lease de scraping"
                            log.error("Se perdió el lease; abortando corrida")
                            break
                        url = self.page_url(pagina)
                        log.info("Fincaraiz página %d: %s", pagina, url)
                        try:
                            self.assert_robots_allowed(url)
                            next_data = self.fetch_next_data(page, url)
                        except BlockedException as e:
                            aborted = True
                            abort_reason = str(e)
                            log.error(
                                "Bloqueo/corte en página %d: %s. Abortando corrida.",
                                pagina,
                                e,
                            )
                            break
                        items, paginator = self.extract_listings(next_data)
                        raw_items += len(items)
                        lp = to_int((paginator or {}).get("lastPage"), 0) or None
                        if lp:
                            last_page = lp
                        log.info("Página %d: %d resultados", pagina, len(items))
                        if last_page and pagina > last_page:
                            log.warning(
                                "Página %d fuera de rango (lastPage=%d); "
                                "reiniciando a 1",
                                pagina,
                                last_page,
                            )
                            pagina = 1
                            continue
                        if not items:
                            if pages_fetched == 0 and pagina > 1:
                                log.warning(
                                    "Página %d vacía; reiniciando a 1", pagina
                                )
                                pagina = 1
                                continue
                            completa = True
                            break
                        raw_current = (paginator or {}).get("currentPage")
                        current = to_int(raw_current)
                        if current is not None and current != pagina:
                            aborted = True
                            abort_reason = (
                                f"página solicitada {pagina}, respuesta {current}"
                            )
                            log.error(
                                "Paginación inconsistente: se pidió %d y el portal "
                                "respondió %d; abortando corrida",
                                pagina,
                                current,
                            )
                            break
                        current = current or pagina
                        page_mapped = 0
                        for item in items:
                            try:
                                doc = self.map_item(item)
                            except Exception:
                                log.exception(
                                    "Item descartado por error de mapeo"
                                )
                                continue
                            if doc:
                                docs.append(doc)
                                page_mapped += 1
                        pages_fetched += 1
                        mapped_items += page_mapped
                        last_ok = pagina
                        if last_page and current >= last_page:
                            log.info(
                                "Última página alcanzada (%d/%d)",
                                current,
                                last_page,
                            )
                            completa = True
                            break
                        pagina += 1
                        self.delay()
                finally:
                    context.close()
            finally:
                browser.close()
        if completa:
            next_page = 1
        elif last_ok == 0:
            next_page = max(1, start_page)
        elif last_page and last_ok >= last_page:
            next_page = 1
        else:
            next_page = last_ok + 1
        return ScrapeResult(
            docs=docs,
            completa=completa,
            next_page=next_page,
            last_page=last_page,
            pages_fetched=pages_fetched,
            raw_items=raw_items,
            mapped_items=mapped_items,
            aborted=aborted,
            abort_reason=abort_reason,
        )

    def extract_listings(self, next_data) -> tuple[list, dict]:
        page_props = (next_data or {}).get("props", {}).get("pageProps", {}) or {}
        fetch_result = page_props.get("fetchResult", {}) or {}
        search = fetch_result.get("searchFast", {}) or {}
        raw_items = search.get("data") or []
        items = [item for item in raw_items if isinstance(item, dict)] \
            if isinstance(raw_items, list) else []
        paginator = search.get("paginatorInfo") or {}
        featured = fetch_result.get("property")
        if (
            featured
            and isinstance(featured, dict)
            and featured.get("id")
            and not any(it.get("id") == featured.get("id") for it in items)
        ):
            items = [*items, featured]
        return items, paginator

    def map_item(self, item: dict) -> dict | None:
        if not isinstance(item, dict):
            return None
        link = item.get("link")
        external_id = item.get("id")
        if not link or external_id is None:
            return None
        url = _safe_listing_url(link)
        if url is None:
            log.warning("Inmueble %s con URL no permitida, se omite", external_id)
            return None

        valorCanon = to_int((item.get("price") or {}).get("amount"))
        if valorCanon is None or valorCanon <= 0:
            log.warning("Inmueble %s sin precio válido, se omite", external_id)
            return None
        if valorCanon > MAX_CANON_S:
            log.warning(
                "Inmueble %s con canon fuera de rango (%d), se omite",
                external_id,
                valorCanon,
            )
            return None

        tamanoM2 = (
            to_float(item.get("m2"))
            or to_float(item.get("m2Built"))
            or to_float(item.get("m2apto"))
        )
        if tamanoM2 is None or tamanoM2 <= 0:
            log.warning("Inmueble %s sin área válida, se omite", external_id)
            return None
        if tamanoM2 > MAX_AREA_M2:
            log.warning(
                "Inmueble %s con área fuera de rango (%.1f), se omite",
                external_id,
                tamanoM2,
            )
            return None

        sheet = _technical_sheet_dict(item)

        common = item.get("commonExpenses") or {}
        valorAdministracion = to_int(common.get("amount"))
        if valorAdministracion is not None and valorAdministracion <= 0:
            valorAdministracion = None

        facilities = item.get("facilities")
        if not isinstance(facilities, list):
            facilities = []
        facil_names = " ".join(
            (f.get("name") or "").lower() if isinstance(f, dict) else str(f).lower()
            for f in facilities
        )
        ascensor = any(k in facil_names for k in ASCENSOR_KEYWORDS)
        patio = any(k in facil_names for k in PATIO_KEYWORDS)

        petFriendly = bool(to_bool(sheet.get("allowPets"), False)) or any(
            k in facil_names for k in PET_KEYWORDS
        )

        # Rango de estrato (1-6) se valida en InmuebleScraped, no acá.
        estrato = to_int(item.get("stratum"))
        piso = to_int(item.get("floor"))
        parqueaderos = to_int(item.get("garage"), 0)

        antiguedad = _antiguedad_anios(sheet)

        locations = item.get("locations") or {}

        descripcion = _sanitize_description(item.get("description"))

        data = {
            "id": f"fincaraiz-{external_id}",
            "portalOrigen": self.portal,
            "urlOriginal": url,
            "valorCanon": valorCanon,
            "administracionIncluida": bool(
                to_bool(item.get("include_administration"), False)
            ),
            "valorAdministracion": valorAdministracion,
            "tamanoM2": tamanoM2,
            "habitaciones": to_int(item.get("bedrooms"), to_int(item.get("rooms"), 0)),
            "banos": to_int(item.get("bathrooms"), 0),
            "patio": patio,
            "parqueaderos": parqueaderos,
            "antiguedadAnos": antiguedad,
            "estrato": estrato,
            "piso": piso,
            "ascensor": ascensor,
            "petFriendly": petFriendly,
            "latitud": to_float(item.get("latitude")),
            "longitud": to_float(item.get("longitude")),
            "descripcion": descripcion,
            "imagenes": _imagenes(item),
            "barrio": _barrio(locations, link),
            "ciudad": _loc_name(locations, "city"),
            "fechaScraping": datetime.now(timezone.utc),
            "activo": True,
        }
        try:
            return InmuebleScraped(**data).model_dump()
        except Exception as e:
            log.warning("Inmueble %s descartado por validación: %s", external_id, e)
            return None
