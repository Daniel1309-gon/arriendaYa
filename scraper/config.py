import os
from math import isfinite
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().with_name(".env"))


def _int_env(name: str, default: str) -> int:
    raw = os.getenv(name, default)
    try:
        return int(raw)
    except ValueError:
        raise ValueError(f"{name}={raw!r} en .env no es un entero válido") from None


def _float_env(name: str, default: str) -> float:
    raw = os.getenv(name, default)
    try:
        value = float(raw)
    except ValueError:
        raise ValueError(f"{name}={raw!r} en .env no es un número válido") from None
    if not isfinite(value):
        raise ValueError(f"{name}={raw!r} debe ser un número finito")
    return value


def _positive_int_env(name: str, default: str) -> int:
    value = _int_env(name, default)
    if value <= 0:
        raise ValueError(f"{name} debe ser mayor que cero")
    return value


def _non_negative_float_env(name: str, default: str) -> float:
    value = _float_env(name, default)
    if value < 0:
        raise ValueError(f"{name} no puede ser negativo")
    return value


def _bool_env(name: str, default: str) -> bool:
    raw = os.getenv(name, default).strip().lower()
    if raw in {"true", "1", "yes", "si", "sí"}:
        return True
    if raw in {"false", "0", "no"}:
        return False
    raise ValueError(f"{name}={raw!r} en .env no es un booleano válido")


def _validate_fincaraiz_url(value: str) -> str:
    parsed = urlparse(value)
    if (
        parsed.scheme != "https"
        or parsed.hostname not in {"fincaraiz.com.co", "www.fincaraiz.com.co"}
        or parsed.query
        or parsed.fragment
        or not parsed.path.startswith("/arriendo/")
    ):
        raise ValueError(
            "FINCARAIZ_BASE_URL debe ser una URL HTTPS canónica de "
            "fincaraiz.com.co/arriendo/ sin query ni fragmento"
        )
    return value.rstrip("/")


def _validate_metrocuadrado_url(value: str) -> str:
    parsed = urlparse(value)
    if (
        parsed.scheme != "https"
        or parsed.hostname not in {"metrocuadrado.com", "www.metrocuadrado.com"}
        or parsed.query
        or parsed.fragment
        or not parsed.path.startswith("/inmuebles/")
    ):
        raise ValueError(
            "METROCUADRADO_BASE_URL debe ser una URL HTTPS canónica de "
            "metrocuadrado.com/inmuebles/ sin query ni fragmento"
        )
    return value.rstrip("/") + "/"


def _validate_metrocuadrado_search_url(value: str) -> str:
    parsed = urlparse(value)
    if (
        parsed.scheme != "https"
        or parsed.hostname not in {"metrocuadrado.com", "www.metrocuadrado.com"}
        or parsed.query
        or parsed.fragment
        or parsed.path != "/rest-search/search"
    ):
        raise ValueError(
            "METROCUADRADO_SEARCH_URL debe ser https://www.metrocuadrado.com/"
            "rest-search/search sin query ni fragmento"
        )
    return value.rstrip("/")


MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017/arriendaya_scraper")
MONGO_DB = os.getenv("MONGO_DB", "arriendaya_scraper")
MONGO_COLLECTION = os.getenv("MONGO_COLLECTION", "inmuebles_scrapeados")

FINCARAIZ_BASE_URL = os.getenv(
    "FINCARAIZ_BASE_URL",
    "https://www.fincaraiz.com.co/arriendo/apartamentos/bogota-dc",
)
FINCARAIZ_BASE_URL = _validate_fincaraiz_url(FINCARAIZ_BASE_URL)
METROCUADRADO_BASE_URL = _validate_metrocuadrado_url(
    os.getenv(
        "METROCUADRADO_BASE_URL",
        "https://www.metrocuadrado.com/inmuebles/arriendo/apartamentos/bogota/",
    )
)
METROCUADRADO_SEARCH_URL = _validate_metrocuadrado_search_url(
    os.getenv(
        "METROCUADRADO_SEARCH_URL",
        "https://www.metrocuadrado.com/rest-search/search",
    )
)
# Esta clave se publica en el JavaScript del portal para que la use su propio
# frontend; no es un secreto de la aplicación. Se puede reemplazar por .env.
METROCUADRADO_API_KEY = os.getenv(
    "METROCUADRADO_API_KEY",
    "P1MfFHfQMOtL16Zpg36NcntJYCLFm8FqFfudnavl",
).strip()
if not METROCUADRADO_API_KEY:
    raise ValueError("METROCUADRADO_API_KEY no puede estar vacío")
MAX_PAGINAS = _positive_int_env("MAX_PAGINAS", "5")
DELAY_MIN_S = _non_negative_float_env("DELAY_MIN_S", "2")
DELAY_MAX_S = _non_negative_float_env("DELAY_MAX_S", "5")
if DELAY_MIN_S > DELAY_MAX_S:
    raise ValueError("DELAY_MIN_S no puede ser mayor que DELAY_MAX_S")
# La ventana de scraping rota entre corridas (cursor persistido en Mongo):
# cada corrida cubre MAX_PAGINAS páginas y la siguiente arranca donde quedó
# la anterior. INACTIVE_AFTER_DAYS debe ser mayor que el barrido real,
# calculado con el lastPage informado por el portal.
INACTIVE_AFTER_DAYS = _positive_int_env("INACTIVE_AFTER_DAYS", "14")
HEADLESS = _bool_env("HEADLESS", "true")
SCRAPE_INTERVAL_HOURS = _positive_int_env("SCRAPE_INTERVAL_HOURS", "3")
MIN_ITEMS_PER_RUN = _positive_int_env("MIN_ITEMS_PER_RUN", "10")
MIN_MAPPED_RATIO = _non_negative_float_env("MIN_MAPPED_RATIO", "0.25")
if MIN_MAPPED_RATIO > 1:
    raise ValueError("MIN_MAPPED_RATIO debe estar entre 0 y 1")
SCRAPE_LEASE_TTL_S = _positive_int_env("SCRAPE_LEASE_TTL_S", "21600")
MAX_CANON_S = _positive_int_env("MAX_CANON_S", "50000000")
MAX_AREA_M2 = _positive_int_env("MAX_AREA_M2", "2000")
METROCUADRADO_ENRICH_DETAILS = _bool_env("METROCUADRADO_ENRICH_DETAILS", "true")
METROCUADRADO_MAX_DETAIL_ITEMS = _positive_int_env(
    "METROCUADRADO_MAX_DETAIL_ITEMS", "50"
)
USER_AGENT = os.getenv(
    "USER_AGENT",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
)
if not USER_AGENT.strip():
    raise ValueError("USER_AGENT no puede estar vacío")
