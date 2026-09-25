import json
import logging
import re
import unicodedata
from datetime import datetime, timezone
from math import ceil
from typing import Callable
from urllib.parse import quote, urlencode, urljoin, urlparse

from playwright.sync_api import Page, sync_playwright

from config import MAX_AREA_M2, MAX_CANON_S
from models import InmuebleScraped
from utils.parsing import first_int, to_float, to_int

from .base import (
    BaseScraper,
    BlockedException,
    PageUnavailableException,
    ScrapeResult,
)

log = logging.getLogger("scraper")

BASE = "https://www.metrocuadrado.com"
ALLOWED_HOSTS = {"metrocuadrado.com", "www.metrocuadrado.com"}
IMAGE_BASE = "https://multimedia.metrocuadrado.com"
MEDIA_COMPONENT_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]*$")
EMAIL_RE = re.compile(r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b")
PHONE_RE = re.compile(
    r"(?<!\d)(?:\+?57[\s-]?)?3\d{2}[\s-]?\d{3}[\s-]?\d{4}(?!\d)"
)
BUILT_TIME_RE = re.compile(r"(?:entre|mas de|menos de)\s+(\d+)", re.IGNORECASE)
FLOOR_RE = re.compile(r"(?:numero|número)\s+de\s+piso\s*(-?\d+)", re.IGNORECASE)
PROPERTY_ID_RE_TEMPLATE = r'"propertyId"\s*:\s*{}'
FLIGHT_PUSH_RE = re.compile(
    r"self\.__next_f\.push\(\[1,(\"(?:\\.|[^\"\\])*\")\]\)",
    re.DOTALL,
)
DETAIL_FIELDS = (
    "valorAdministracion",
    "antiguedadAnos",
    "estrato",
    "piso",
    "patio",
    "ascensor",
    "petFriendly",
    "latitud",
    "longitud",
)
# Marca de que el detalle ya se visitó (aunque no trajera datos). No está en
# InmuebleScraped a propósito: el doc del listado no debe traer la clave, o el
# $set de upsert_inmuebles la borraría en cada refresco.
DETAIL_ATTEMPT_FIELD = "detalleIntentadoEn"


def _normalize_text(value) -> str:
    if not isinstance(value, str):
        return ""
    return unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode(
        "ascii"
    ).lower()


def _safe_url(link) -> str | None:
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


def _name(value) -> str | None:
    if isinstance(value, dict):
        value = value.get("nombre")
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value or None


def _gallery_urls(item: dict, external_id: str) -> list[str]:
    urls: list[str] = []
    cover = item.get("imageLink")
    if isinstance(cover, str):
        urls.append(cover.strip())

    gallery = item.get("mgaleriainmueble")
    if not isinstance(gallery, list):
        return urls

    if not MEDIA_COMPONENT_RE.fullmatch(external_id):
        return urls
    for raw_name in gallery:
        if not isinstance(raw_name, str):
            continue
        image_name = raw_name.strip()
        if not MEDIA_COMPONENT_RE.fullmatch(image_name):
            continue
        if not image_name.startswith(f"{external_id}_"):
            continue
        urls.append(
            f"{IMAGE_BASE}/{quote(external_id, safe='-_.')}/"
            f"{quote(image_name, safe='-_.')}_p.jpg"
        )
    return urls


def parse_built_time(value) -> int | None:
    normalized = _normalize_text(value)
    if not normalized:
        return None
    if "nuevo" in normalized:
        return 0
    match = BUILT_TIME_RE.search(normalized)
    if match:
        return int(match.group(1))
    return first_int(normalized)


def _flight_payload(html: str) -> str:
    chunks: list[str] = []
    for match in FLIGHT_PUSH_RE.finditer(html):
        try:
            chunks.append(json.loads(match.group(1)))
        except json.JSONDecodeError:
            continue
    return "\n".join(chunks)


def parse_detail_html(html: str, property_id: str) -> dict:
    """Extrae el objeto de inmueble del RSC payload de Next.js."""
    payload = _flight_payload(html)
    property_value = json.dumps(property_id, ensure_ascii=False)
    marker = re.compile(PROPERTY_ID_RE_TEMPLATE.format(re.escape(property_value)))
    property_match = marker.search(payload)
    if property_match is None:
        raise ValueError(f"No se encontró el detalle de {property_id} en el RSC payload")

    decoder = json.JSONDecoder()
    starts = list(re.finditer(r"\{", payload[: property_match.start()]))
    for start_match in reversed(starts[-1000:]):
        start = start_match.start()
        try:
            data, _ = decoder.raw_decode(payload[start:])
        except json.JSONDecodeError:
            continue
        if isinstance(data, dict) and str(data.get("propertyId")) == property_id:
            return data
    raise ValueError(f"No se encontró el detalle de {property_id} en el RSC payload")


def _feature_items(detail: dict) -> list[str]:
    features: list[str] = []
    featured = detail.get("featured")
    if isinstance(featured, list):
        for group in featured:
            if not isinstance(group, dict):
                continue
            items = group.get("items")
            if isinstance(items, list):
                features.extend(item for item in items if isinstance(item, str))
    characteristics = detail.get("mcaracteristicas")
    if isinstance(characteristics, list):
        features.extend(item for item in characteristics if isinstance(item, str))
    return features


def _feature_text(detail: dict) -> str:
    return " ".join(_normalize_text(item) for item in _feature_items(detail))


def _valid_int(value, minimum: int, maximum: int) -> int | None:
    parsed = to_int(value)
    if parsed is None or not minimum <= parsed <= maximum:
        return None
    return parsed


def _merge_stored_detail(doc: dict, stored: dict | None) -> bool:
    has_detail = False
    for field in DETAIL_FIELDS:
        value = stored.get(field) if stored else None
        if value is not None and value is not False:
            doc[field] = value
            if field != "valorAdministracion":
                has_detail = True
    return has_detail or bool(stored and stored.get(DETAIL_ATTEMPT_FIELD))


class MetrocuadradoScraper(BaseScraper):
    portal = "metrocuadrado"

    def __init__(
        self,
        base_url: str,
        search_url: str,
        api_key: str,
        max_paginas: int,
        delay_min: float,
        delay_max: float,
        headless: bool,
        user_agent: str,
        page_size: int = 50,
        enrich_details: bool = True,
        max_detail_items: int = 50,
    ):
        super().__init__(
            base_url=base_url,
            max_paginas=max_paginas,
            delay_min=delay_min,
            delay_max=delay_max,
            headless=headless,
            user_agent=user_agent,
        )
        self.search_url = search_url
        self.api_key = api_key
        self.page_size = page_size
        self.enrich_details = enrich_details
        self.max_detail_items = max_detail_items

    @staticmethod
    def extract_listings(payload: dict) -> tuple[list[dict], int, int]:
        raw_items = payload.get("results") if isinstance(payload, dict) else None
        items = [item for item in raw_items if isinstance(item, dict)] \
            if isinstance(raw_items, list) else []
        total_hits = max(0, to_int(payload.get("totalHits"), 0) or 0)
        total_entries = max(0, to_int(payload.get("totalEntries"), 0) or 0)
        return items, total_hits, total_entries

    def _search_url(self, from_: int) -> str:
        params = urlencode(
            {
                "search": "save",
                "from": from_,
                "size": self.page_size,
                "realEstateTypeList": "apartamento",
                "realEstateBusinessList": "arriendo",
                "city": "bogota",
            }
        )
        return f"{self.search_url}?{params}"

    def map_item(self, item: dict) -> dict | None:
        if not isinstance(item, dict):
            return None
        raw_id = item.get("midinmueble") or item.get("propertyId")
        if raw_id is None or isinstance(raw_id, bool):
            return None
        external_id = str(raw_id).strip()
        if not external_id:
            return None

        url = _safe_url(item.get("link"))
        if url is None:
            log.warning("Inmueble %s con URL no permitida, se omite", external_id)
            return None

        valor_canon = to_int(item.get("mvalorarriendo"))
        if valor_canon is None or valor_canon <= 0 or valor_canon > MAX_CANON_S:
            log.warning("Inmueble %s sin canon válido, se omite", external_id)
            return None

        tamano_m2 = (
            to_float(item.get("marea"))
            or to_float(item.get("mareac"))
            or to_float(item.get("areaprivada"))
        )
        if tamano_m2 is None or tamano_m2 <= 0 or tamano_m2 > MAX_AREA_M2:
            log.warning("Inmueble %s sin área válida, se omite", external_id)
            return None

        city = _name(item.get("mciudad"))
        barrio = _name(item.get("mbarrio")) or _name(item.get("mnombrecomunbarrio"))
        item_data = item.get("data")
        raw_administracion = (
            item_data.get("mvaloradministracion")
            if isinstance(item_data, dict)
            else None
        )
        valor_administracion = to_int(raw_administracion)
        if valor_administracion is not None and valor_administracion <= 0:
            valor_administracion = None
        data = {
            "id": f"metrocuadrado-{external_id}",
            "portalOrigen": self.portal,
            "urlOriginal": url,
            "valorCanon": valor_canon,
            "administracionIncluida": False,
            "valorAdministracion": valor_administracion,
            "tamanoM2": tamano_m2,
            "habitaciones": to_int(item.get("mnrocuartos"), 0),
            "banos": to_int(item.get("mnrobanos"), 0),
            "patio": False,
            "parqueaderos": to_int(item.get("mnrogarajes"), 0),
            "antiguedadAnos": None,
            "estrato": None,
            "piso": None,
            "ascensor": False,
            "petFriendly": False,
            "latitud": None,
            "longitud": None,
            "descripcion": _sanitize_description(item.get("comment")),
            "imagenes": _gallery_urls(item, external_id),
            "barrio": barrio,
            "ciudad": city,
            "fechaScraping": datetime.now(timezone.utc),
            "activo": True,
        }
        try:
            return InmuebleScraped(**data).model_dump()
        except Exception as exc:
            log.warning("Inmueble %s descartado por validación: %s", external_id, exc)
            return None

    def enrich_doc(self, doc: dict, html: str) -> dict:
        external_id = str(doc.get("id", "")).removeprefix("metrocuadrado-")
        try:
            detail = parse_detail_html(html, external_id)
        except Exception as exc:
            log.warning("No se pudo parsear detalle de %s: %s", external_id, exc)
            return doc

        admin_price = to_int((detail.get("detail") or {}).get("adminPrice"))
        if admin_price is not None and admin_price > 0:
            doc["valorAdministracion"] = admin_price

        # Metrocuadrado usa S para marcar ubicación aproximada; N significa
        # que las coordenadas pueden mostrarse como exactas. Cualquier otro
        # valor (ausente, null, desconocido) se trata como aproximado.
        if detail.get("ubicacionaproximada") == "N":
            coordinates = detail.get("coordinates")
            if isinstance(coordinates, dict):
                latitude = to_float(coordinates.get("lat"))
                longitude = to_float(coordinates.get("lon"))
                if latitude is not None and longitude is not None:
                    doc["latitud"] = latitude
                    doc["longitud"] = longitude

        estrato = _valid_int(detail.get("stratum"), 1, 6)
        if estrato is not None:
            doc["estrato"] = estrato

        antiguedad = parse_built_time(detail.get("builtTime"))
        if antiguedad is not None and 0 <= antiguedad <= 200:
            doc["antiguedadAnos"] = antiguedad

        features = _feature_text(detail)
        doc["patio"] = "patio" in features
        doc["ascensor"] = "ascensor" in features
        doc["petFriendly"] = (
            ("mascota" in features or "pet friendly" in features)
            and "no se permiten mascotas" not in features
        )

        floor = _valid_int(detail.get("floor"), -10, 200)
        if floor is None:
            for feature in _feature_items(detail):
                match = FLOOR_RE.search(_normalize_text(feature))
                if match:
                    floor = _valid_int(match.group(1), -10, 200)
                    break
        if floor is not None:
            doc["piso"] = floor

        try:
            doc = InmuebleScraped(**doc).model_dump()
        except Exception as exc:
            log.warning("Detalle de %s descartado por validación: %s", external_id, exc)
        doc[DETAIL_ATTEMPT_FIELD] = datetime.now(timezone.utc)
        return doc

    def _enrich_new_docs(self, page: Page, docs: list[dict], before_page) -> bool:
        if not self.enrich_details or not docs:
            return True

        from db import get_existing_docs

        unique_docs = {doc["id"]: doc for doc in docs}
        try:
            existing = get_existing_docs(self.portal, list(unique_docs))
        except Exception:
            log.exception("No se pudieron consultar inmuebles existentes; se omite enrich")
            return True

        detail_items = 0
        for doc_id, doc in unique_docs.items():
            if detail_items >= self.max_detail_items:
                log.info(
                    "Límite de enrich alcanzado (%d inmuebles)",
                    self.max_detail_items,
                )
                return True
            stored = existing.get(doc_id)
            if _merge_stored_detail(doc, stored):
                continue
            detail_items += 1
            if before_page is not None and not before_page():
                log.warning("Se perdió el lease durante el enrich de Metrocuadrado")
                return False
            detail_url = doc["urlOriginal"]
            try:
                self.assert_robots_allowed(detail_url)
                html = self.fetch_page_html(page, detail_url)
                doc.update(self.enrich_doc(doc, html))
            except PageUnavailableException as exc:
                log.warning("Detalle no disponible en %s, se omite: %s", detail_url, exc)
                doc[DETAIL_ATTEMPT_FIELD] = datetime.now(timezone.utc)
            except BlockedException as exc:
                log.warning("Enrich detenido por bloqueo en %s: %s", detail_url, exc)
                return True
            except Exception:
                log.exception("Error enriqueciendo el inmueble %s", doc_id)
            self.delay()
        return True

    def scrape(
        self,
        start_from: int = 0,
        before_page: Callable[[], bool] | None = None,
    ) -> ScrapeResult:
        docs: list[dict] = []
        next_from = max(0, start_from)
        last_page: int | None = None
        total_hits = 0
        total_entries = 0
        pages_fetched = 0
        raw_items = 0
        mapped_items = 0
        completa = False
        aborted = False
        abort_reason: str | None = None
        reset_attempted = False

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=self.headless)
            try:
                context = browser.new_context(
                    user_agent=self.user_agent, locale="es-CO"
                )
                try:
                    page = context.new_page()
                    self.assert_robots_allowed(self.base_url)
                    self.assert_robots_allowed(self.search_url)
                    self.navigate(page, self.base_url)

                    while pages_fetched < self.max_paginas:
                        if before_page is not None and not before_page():
                            aborted = True
                            abort_reason = "se perdió el lease de scraping"
                            break

                        request_url = self._search_url(next_from)
                        log.info("Metrocuadrado offset %d: %s", next_from, request_url)
                        try:
                            payload = self.fetch_search_json(
                                page, request_url, self.api_key
                            )
                        except BlockedException as exc:
                            aborted = True
                            abort_reason = str(exc)
                            log.error("Bloqueo en offset %d: %s", next_from, exc)
                            break

                        items, page_hits, page_entries = self.extract_listings(payload)
                        total_hits = page_hits or total_hits
                        total_entries = page_entries or total_entries
                        available = min(total_hits, total_entries) if total_entries else total_hits
                        if available:
                            last_page = ceil(available / self.page_size)
                        raw_items += len(items)
                        log.info("Metrocuadrado offset %d: %d resultados", next_from, len(items))

                        if not items:
                            if pages_fetched == 0 and next_from > 0 and not reset_attempted:
                                reset_attempted = True
                                next_from = 0
                                continue
                            completa = True
                            next_from = 0
                            break

                        page_mapped = 0
                        for item in items:
                            try:
                                doc = self.map_item(item)
                            except Exception:
                                log.exception("Item descartado por error de mapeo")
                                continue
                            if doc:
                                docs.append(doc)
                                page_mapped += 1
                        pages_fetched += 1
                        mapped_items += page_mapped

                        if total_entries and next_from + self.page_size >= total_entries:
                            completa = True
                            next_from = 0
                            break
                        next_from += self.page_size
                        self.delay()

                    if docs and not self._enrich_new_docs(page, docs, before_page):
                        aborted = True
                        abort_reason = "se perdió el lease durante el enrich"
                finally:
                    context.close()
            finally:
                browser.close()

        return ScrapeResult(
            docs=docs,
            completa=completa,
            next_page=next_from,
            last_page=last_page,
            pages_fetched=pages_fetched,
            raw_items=raw_items,
            mapped_items=mapped_items,
            aborted=aborted,
            abort_reason=abort_reason,
        )
