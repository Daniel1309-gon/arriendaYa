import json
import logging
import random
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from urllib.robotparser import RobotFileParser

from playwright.sync_api import Page

log = logging.getLogger("scraper")


class BlockedException(Exception):
    pass


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

    def assert_robots_allowed(self, url: str) -> None:
        parsed = urlparse(url)
        origin = f"{parsed.scheme}://{parsed.netloc}"
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
        last_err: Exception | None = None
        for i in range(attempts):
            try:
                resp = page.goto(url, wait_until="domcontentloaded", timeout=60000)
                status = resp.status if resp else 0
                if status in (401, 403, 404, 407, 410, 429):
                    raise BlockedException(f"HTTP {status} en {url}")
                if status >= 500:
                    raise RuntimeError(f"HTTP {status} en {url}")
                if resp is not None and self._path_of(page.url) != self._path_of(url):
                    raise BlockedException(
                        f"Redirección inesperada: se pidió {url} y se obtuvo {page.url}"
                    )
                text = page.evaluate(
                    "() => { const el = document.getElementById('__NEXT_DATA__');"
                    " return el ? el.textContent : null; }"
                )
                if not text:
                    raise BlockedException(
                        f"Sin __NEXT_DATA__ en {url} (posible captcha/bloqueo)"
                    )
                return json.loads(text)
            except BlockedException:
                raise
            except Exception as e:
                last_err = e
                log.warning("Intento %d/%d fallido para %s: %s", i + 1, attempts, url, e)
                self.delay()
        raise BlockedException(f"No se pudo obtener {url}: {last_err}")

    def extract_listings(self, next_data) -> tuple[list, dict]:
        raise NotImplementedError

    def map_item(self, item) -> dict | None:
        raise NotImplementedError
