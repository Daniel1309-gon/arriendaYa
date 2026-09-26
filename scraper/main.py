import logging
import uuid
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.blocking import BlockingScheduler

from config import (
    DELAY_MAX_S,
    DELAY_MIN_S,
    FINCARAIZ_BASE_URL,
    HEADLESS,
    INACTIVE_AFTER_DAYS,
    MIN_ITEMS_PER_RUN,
    MIN_MAPPED_RATIO,
    MAX_PAGINAS,
    METROCUADRADO_API_KEY,
    METROCUADRADO_BASE_URL,
    METROCUADRADO_ENRICH_DETAILS,
    METROCUADRADO_MAX_DETAIL_ITEMS,
    METROCUADRADO_SEARCH_URL,
    SCRAPE_LEASE_TTL_S,
    SCRAPE_INTERVAL_HOURS,
    USER_AGENT,
)
from db import (
    acquire_scrape_lease,
    close_client,
    ensure_indexes,
    get_cursor,
    marcar_inactivos,
    release_scrape_lease,
    renew_scrape_lease,
    set_cursor,
    upsert_inmuebles,
)
from scrapers.fincaraiz import FincaraizScraper
from scrapers.metrocuadrado import MetrocuadradoScraper

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("scraper")


def _build_scraper(portal: str):
    if portal == "fincaraiz":
        return FincaraizScraper(
            base_url=FINCARAIZ_BASE_URL,
            max_paginas=MAX_PAGINAS,
            delay_min=DELAY_MIN_S,
            delay_max=DELAY_MAX_S,
            headless=HEADLESS,
            user_agent=USER_AGENT,
        )
    if portal == "metrocuadrado":
        return MetrocuadradoScraper(
            base_url=METROCUADRADO_BASE_URL,
            search_url=METROCUADRADO_SEARCH_URL,
            api_key=METROCUADRADO_API_KEY,
            max_paginas=MAX_PAGINAS,
            delay_min=DELAY_MIN_S,
            delay_max=DELAY_MAX_S,
            headless=HEADLESS,
            user_agent=USER_AGENT,
            enrich_details=METROCUADRADO_ENRICH_DETAILS,
            max_detail_items=METROCUADRADO_MAX_DETAIL_ITEMS,
        )
    raise ValueError(f"Portal no soportado: {portal}")


def run_scrape(portal: str) -> None:
    log.info("=== Iniciando corrida de %s ===", portal)
    owner = uuid.uuid4().hex

    try:
        if not acquire_scrape_lease(portal, owner, SCRAPE_LEASE_TTL_S):
            log.warning("Ya existe otra corrida de %s; se omite esta ejecución", portal)
            return
        try:
            ensure_indexes()

            try:
                cursor = get_cursor(portal)
            except Exception:
                log.exception("No se pudo leer el cursor de %s; no se hará scraping", portal)
                return

            scraper = _build_scraper(portal)
            try:
                result = scraper.scrape(
                    cursor,
                    before_page=lambda: renew_scrape_lease(
                        portal, owner, SCRAPE_LEASE_TTL_S
                    ),
                )
            except Exception:
                log.exception("Error en corrida de scraping de %s", portal)
                return

            if not result.docs:
                log.warning("La corrida no trajo resultados; no se mueve el cursor")
                return

            ratio = (
                result.mapped_items / result.raw_items
                if result.raw_items
                else 0
            )
            if (
                result.pages_fetched == 0
                or result.mapped_items < MIN_ITEMS_PER_RUN
                or ratio < MIN_MAPPED_RATIO
            ):
                log.error(
                    "Corrida rechazada por calidad: %d páginas, %d/%d items mapeados "
                    "(mínimo %d y ratio %.0f%%)",
                    result.pages_fetched,
                    result.mapped_items,
                    result.raw_items,
                    MIN_ITEMS_PER_RUN,
                    MIN_MAPPED_RATIO * 100,
                )
                return

            nuevo_cursor = cursor
            try:
                nuevos, actualizados = upsert_inmuebles(result.docs)
                desactivados = 0
                if result.lease_lost:
                    # Otro proceso tiene el lease y rota el cursor; escribirlo
                    # acá pisaría su avance.
                    log.warning(
                        "Corrida de %s perdió el lease: se guardan páginas válidas, "
                        "pero no se mueve el cursor ni se marcan inactivos (%s)",
                        portal,
                        result.abort_reason or "motivo desconocido",
                    )
                else:
                    if result.aborted:
                        log.warning(
                            "Corrida parcial de %s: se guardan páginas válidas y el "
                            "cursor avanza hasta la última válida, pero no se "
                            "marcan inactivos (%s)",
                            portal,
                            result.abort_reason or "motivo desconocido",
                        )
                    else:
                        corte = datetime.now(timezone.utc) - timedelta(
                            days=INACTIVE_AFTER_DAYS
                        )
                        desactivados = marcar_inactivos(portal, corte)
                    set_cursor(portal, result.next_page, result.last_page)
                    nuevo_cursor = result.next_page
            except Exception:
                log.exception("Error guardando resultados de %s en Mongo", portal)
                return

            if result.last_page:
                dias_barrido = (
                    -(-result.last_page // MAX_PAGINAS)
                    * SCRAPE_INTERVAL_HOURS
                    / 24
                )
                if INACTIVE_AFTER_DAYS <= dias_barrido:
                    log.warning(
                        "INACTIVE_AFTER_DAYS=%d no supera el barrido completo (~%.1f días): "
                        "sube INACTIVE_AFTER_DAYS o MAX_PAGINAS",
                        INACTIVE_AFTER_DAYS,
                        dias_barrido,
                    )

            log.info(
                "Resumen %s: %d nuevos, %d actualizados, %d desactivados "
                "(%d items, cursor %d→%d%s, corrida %s)",
                portal,
                nuevos,
                actualizados,
                desactivados,
                len(result.docs),
                cursor,
                nuevo_cursor,
                f"/{result.last_page}" if result.last_page else "",
                "completa" if result.completa else "parcial",
            )
        finally:
            release_scrape_lease(portal, owner)
    except Exception:
        log.exception("Error no controlado en la corrida de %s", portal)


def run_all_scrapes() -> None:
    for portal in ("fincaraiz", "metrocuadrado"):
        run_scrape(portal)


if __name__ == "__main__":
    log.info("Scraper Rentia — Fincaraiz + Metrocuadrado")

    scheduler = BlockingScheduler()
    scheduler.add_job(
        run_all_scrapes,
        "interval",
        hours=SCRAPE_INTERVAL_HOURS,
        next_run_time=datetime.now(),  # corre inmediatamente al arrancar
        max_instances=1,
        coalesce=True,
    )
    log.info("Scheduler iniciado. Corre cada %d horas.", SCRAPE_INTERVAL_HOURS)
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        log.info("Scheduler detenido.")
    finally:
        close_client()
