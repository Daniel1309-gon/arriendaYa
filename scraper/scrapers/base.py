import json
import logging
import random
import time
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from urllib.robotparser import RobotFileParser

from playwright.sync_api import Page

log = logging.getLogger("scraper")


class BlockedException(Exception):
    pass


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


class BaseScraper:
    portal = "base"

    def __init__(
        self,
        base_url: str,
        max_paginas: int,
        delay_min: float,
        delay_max: float,
        headless: bool,
        user_agent: str,
    ):
        self.base_url = base_url
        self.max_paginas = max_paginas
        self.delay_min = delay_min
        self.delay_max = delay_max
        self.headless = headless
        self.user_agent = user_agent
        self._robots_cache: dict[str, RobotFileParser] = {}

    def page_url(self, page_number: int) -> str:
        raise NotImplementedError

    def delay(self) -> None:
        time.sleep(random.uniform(self.delay_min, self.delay_max))

    @staticmethod
    def _path_of(url: str) -> str:
        path = urlparse(url).path or "/"
        return path.rstrip("/") or "/"

    @staticmethod
    def _origin_of(url: str) -> str:
        parsed = urlparse(url)
        return f"{parsed.scheme.lower()}://{(parsed.netloc or '').lower()}"

    def assert_robots_allowed(self, url: str) -> None:
        origin = self._origin_of(url)
        parser = self._robots_cache.get(origin)
        if parser is None:
            robots_url = f"{origin}/robots.txt"
            request = Request(robots_url, headers={"User-Agent": self.user_agent})
            try:
                with urlopen(request, timeout=15) as response:
                    content = response.read().decode("utf-8", errors="replace")
            except HTTPError as exc:
                if exc.code == 404:
                    content = "User-agent: *\nAllow: /\n"
                else:
                    raise BlockedException(
                        f"No se pudo consultar robots.txt ({exc.code}) en {origin}"
                    ) from exc
            except URLError as exc:
                raise BlockedException(
                    f"No se pudo consultar robots.txt en {origin}: {exc.reason}"
                ) from exc
            parser = RobotFileParser()
            parser.set_url(robots_url)
            parser.parse(content.splitlines())
            self._robots_cache[origin] = parser

        if not parser.can_fetch(self.user_agent, url):
            raise BlockedException(f"robots.txt no permite {url}")

    def fetch_next_data(self, page: Page, url: str, attempts: int = 2):
        self.navigate(page, url, attempts=attempts)
        text = page.evaluate(
            "() => { const el = document.getElementById('__NEXT_DATA__');"
            " return el ? el.textContent : null; }"
        )
        if not text:
            raise BlockedException(
                f"Sin __NEXT_DATA__ en {url} (posible captcha/bloqueo)"
            )
        try:
            return json.loads(text)
        except json.JSONDecodeError as exc:
            raise BlockedException(f"__NEXT_DATA__ ilegible en {url}") from exc

    def navigate(self, page: Page, url: str, attempts: int = 2) -> None:
        """Navega a una página sin asumir el mecanismo de renderizado del portal."""
        last_err: Exception | None = None
        for i in range(attempts):
            try:
                response = page.goto(
                    url, wait_until="domcontentloaded", timeout=60000
                )
                status = response.status if response else 0
                if 400 <= status < 500:
                    raise BlockedException(f"HTTP {status} en {url}")
                if status >= 500:
                    raise RuntimeError(f"HTTP {status} en {url}")
                if response is not None and (
                    self._origin_of(page.url) != self._origin_of(url)
                    or self._path_of(page.url) != self._path_of(url)
                ):
                    raise BlockedException(
                        f"Redirección inesperada: se pidió {url} y se obtuvo {page.url}"
                    )
                return
            except BlockedException:
                raise
            except Exception as exc:
                last_err = exc
                log.warning(
                    "Intento %d/%d fallido para %s: %s", i + 1, attempts, url, exc
                )
                self.delay()
        raise BlockedException(f"No se pudo obtener {url}: {last_err}")

    def fetch_page_html(self, page: Page, url: str, attempts: int = 2) -> str:
        self.navigate(page, url, attempts=attempts)
        return page.content()

    def fetch_search_json(
        self, page: Page, url: str, api_key: str, attempts: int = 2
    ) -> dict:
        """Obtiene JSON desde el mismo contexto del navegador que abrió el portal."""
        last_err: Exception | None = None
        for i in range(attempts):
            try:
                result = page.evaluate(
                    """
                    async ({ url, apiKey }) => {
                        const response = await fetch(url, {
                            credentials: "include",
                            headers: { "X-Api-Key": apiKey },
                        });
                        return {
                            status: response.status,
                            body: await response.text(),
                        };
                    }
                    """,
                    {"url": url, "apiKey": api_key},
                )
                status = int(result.get("status", 0))
                body = result.get("body", "")
                if 400 <= status < 500:
                    raise BlockedException(f"HTTP {status} en {url}")
                if status >= 500:
                    raise RuntimeError(f"HTTP {status} en {url}")
                if not isinstance(body, str) or not body:
                    raise BlockedException(f"Respuesta vacía en {url}")
                try:
                    payload = json.loads(body)
                except json.JSONDecodeError as exc:
                    raise BlockedException(
                        f"Respuesta no JSON en {url} (posible bloqueo)"
                    ) from exc
                if not isinstance(payload, dict):
                    raise BlockedException(f"JSON inesperado en {url}")
                return payload
            except BlockedException:
                raise
            except Exception as exc:
                last_err = exc
                log.warning(
                    "Intento %d/%d fallido para %s: %s", i + 1, attempts, url, exc
                )
                self.delay()
        raise BlockedException(f"No se pudo obtener {url}: {last_err}")

    def extract_listings(self, next_data) -> tuple[list, dict]:
        raise NotImplementedError

    def map_item(self, item) -> dict | None:
        raise NotImplementedError
