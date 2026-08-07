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

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("scraper")


def run_scrape() -> None:
    log.info("=== Iniciando corrida de scraping ===")
    owner = uuid.uuid4().hex

    try:
        if not acquire_scrape_lease("fincaraiz", owner, SCRAPE_LEASE_TTL_S):
            log.warning("Ya existe otra corrida de Fincaraiz; se omite esta ejecución")
            return
        try:
            ensure_indexes()

            try:
                cursor = get_cursor("fincaraiz")
            except Exception:
                log.exception("No se pudo leer el cursor; no se hará scraping")
                return

            scraper = FincaraizScraper(
                base_url=FINCARAIZ_BASE_URL,
                max_paginas=MAX_PAGINAS,
                delay_min=DELAY_MIN_S,
                delay_max=DELAY_MAX_S,
                headless=HEADLESS,
                user_agent=USER_AGENT,
            )
            try:
                result = scraper.scrape(
                    cursor,
                    before_page=lambda: renew_scrape_lease(
                        "fincaraiz", owner, SCRAPE_LEASE_TTL_S
                    ),
                )
            except Exception:
                log.exception("Error en corrida de scraping")
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

            try:
                nuevos, actualizados = upsert_inmuebles(result.docs)
                desactivados = 0
                if result.aborted:
                    log.warning(
                        "Corrida parcial: se guardan páginas válidas, pero no se "
                        "marcan inactivos (%s)",
                        result.abort_reason or "motivo desconocido",
                    )
                else:
                    corte = datetime.now(timezone.utc) - timedelta(
                        days=INACTIVE_AFTER_DAYS
                    )
                    desactivados = marcar_inactivos("fincaraiz", corte)
                set_cursor("fincaraiz", result.next_page, result.last_page or 0)
            except Exception:
                log.exception("Error guardando resultados en Mongo")
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
                "Resumen: %d nuevos, %d actualizados, %d desactivados "
                "(%d items, páginas %d→%d%s, corrida %s)",
                nuevos,
                actualizados,
                desactivados,
                len(result.docs),
                cursor,
                result.next_page,
                f"/{result.last_page}" if result.last_page else "",
                "completa" if result.completa else "parcial",
            )
        finally:
            release_scrape_lease("fincaraiz", owner)
    except Exception:
        log.exception("Error no controlado en la corrida de scraping")


if __name__ == "__main__":
    log.info("Scraper Rentia — Fincaraiz")

    scheduler = BlockingScheduler()
    scheduler.add_job(
        run_scrape,
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
