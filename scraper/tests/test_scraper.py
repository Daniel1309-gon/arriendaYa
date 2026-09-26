import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from models import MAX_IMAGENES, InmuebleScraped
from scrapers.fincaraiz import FincaraizScraper
from utils.parsing import to_bool, to_float, to_int

CDN = "https://cdn2.infocasas.com.uy/repo/img"


class ParsingTests(unittest.TestCase):
    def test_localized_numbers_do_not_include_units(self):
        self.assertEqual(to_int("$230.200"), 230200)
        self.assertEqual(to_int("1.500.000"), 1500000)
        self.assertEqual(to_int("45 m2"), 45)
        self.assertEqual(to_float("42.5 m²"), 42.5)
        self.assertAlmostEqual(to_float("4,6097"), 4.6097)
        self.assertAlmostEqual(to_float("-74,0817"), -74.0817)

    def test_boolean_parser_handles_text(self):
        self.assertFalse(to_bool("false"))
        self.assertTrue(to_bool("Sí"))


class FincaraizMappingTests(unittest.TestCase):
    def setUp(self):
        self.scraper = FincaraizScraper(
            base_url="https://www.fincaraiz.com.co/arriendo/apartamentos/bogota-dc",
            max_paginas=1,
            delay_min=0,
            delay_max=0,
            headless=True,
            user_agent="test-agent",
        )

    def test_map_item_normalizes_and_sanitizes(self):
        year = datetime.now(timezone.utc).year - 5
        item = {
            "id": 123,
            "link": "/apartamento-ejemplo",
            "price": {"amount": "$2.300.000"},
            "m2": "42.5 m²",
            "bedrooms": "2",
            "bathrooms": "1",
            "include_administration": "false",
            "latitude": "4,6097",
            "longitude": "-74,0817",
            "description": "Escribe a prueba@example.com o al 320 123 4567.",
            "technicalSheet": [
                {"field": "constructionYear", "value": str(year)},
            ],
        }

        doc = self.scraper.map_item(item)

        self.assertIsNotNone(doc)
        assert doc is not None
        self.assertEqual(doc["valorCanon"], 2300000)
        self.assertEqual(doc["tamanoM2"], 42.5)
        self.assertFalse(doc["administracionIncluida"])
        self.assertEqual(doc["antiguedadAnos"], 5)
        self.assertAlmostEqual(doc["latitud"], 4.6097)
        self.assertAlmostEqual(doc["longitud"], -74.0817)
        self.assertNotIn("@", doc["descripcion"])
        self.assertNotIn("320 123 4567", doc["descripcion"])

    def test_map_item_collects_cover_first_then_gallery(self):
        item = {
            "id": 123,
            "link": "/apartamento-ejemplo",
            "price": {"amount": 2000000},
            "m2": 50,
            "img": f"{CDN}/portada.jpg",
            "images": [
                {"id": 1, "image": f"{CDN}/portada.jpg", "tag": ""},
                {"id": 2, "image": f"{CDN}/segunda.jpg", "tag": ""},
                {"id": 3, "image": f"{CDN}/tercera.jpg", "tag": ""},
            ],
        }

        doc = self.scraper.map_item(item)

        assert doc is not None
        # La portada va primero y no se repite pese a estar también en images.
        self.assertEqual(
            doc["imagenes"],
            [f"{CDN}/portada.jpg", f"{CDN}/segunda.jpg", f"{CDN}/tercera.jpg"],
        )

    def test_map_item_without_photos_is_still_valid(self):
        doc = self.scraper.map_item(
            {
                "id": 123,
                "link": "/apartamento-ejemplo",
                "price": {"amount": 2000000},
                "m2": 50,
            }
        )

        assert doc is not None
        self.assertEqual(doc["imagenes"], [])

    def test_map_item_drops_untrusted_image_urls(self):
        doc = self.scraper.map_item(
            {
                "id": 123,
                "link": "/apartamento-ejemplo",
                "price": {"amount": 2000000},
                "m2": 50,
                "images": [
                    {"image": "https://evil.test/robo.jpg"},
                    {"image": f"http://{CDN.removeprefix('https://')}/insegura.jpg"},
                    {"image": "https://notinfocasas.com.uy/falso.jpg"},
                    {"image": None},
                    "https://cdn2.infocasas.com.uy/repo/img/ok.jpg",
                ],
            }
        )

        assert doc is not None
        self.assertEqual(doc["imagenes"], ["https://cdn2.infocasas.com.uy/repo/img/ok.jpg"])

    def test_map_item_truncates_gallery_to_ten(self):
        doc = self.scraper.map_item(
            {
                "id": 123,
                "link": "/apartamento-ejemplo",
                "price": {"amount": 2000000},
                "m2": 50,
                "images": [{"image": f"{CDN}/foto{n}.jpg"} for n in range(25)],
            }
        )

        assert doc is not None
        self.assertEqual(len(doc["imagenes"]), MAX_IMAGENES)
        self.assertEqual(doc["imagenes"][0], f"{CDN}/foto0.jpg")

    def test_map_item_rejects_external_url_and_outlier_price(self):
        base = {
            "id": 123,
            "price": {"amount": 2000000},
            "m2": 50,
        }
        self.assertIsNone(self.scraper.map_item({**base, "link": "https://evil.test/x"}))
        self.assertIsNone(
            self.scraper.map_item(
                {**base, "link": "/x", "price": {"amount": 50000000000}}
            )
        )

    def test_empty_end_wraps_cursor_to_page_one(self):
        class StubScraper(FincaraizScraper):
            def assert_robots_allowed(self, url):
                return None

            def fetch_next_data(self, page, url, attempts=2):
                page_number = int(url.rsplit("pagina", 1)[-1]) if "pagina" in url else 1
                return {
                    "props": {
                        "pageProps": {
                            "fetchResult": {
                                "searchFast": {
                                    "data": [{"id": page_number}] if page_number == 1 else [],
                                    "paginatorInfo": {},
                                }
                            }
                        }
                    }
                }

            def map_item(self, item):
                return {"id": f"fincaraiz-{item['id']}"}

            def delay(self):
                return None

        class Context:
            def new_page(self):
                return object()

            def close(self):
                return None

        class Browser:
            def new_context(self, **kwargs):
                return Context()

            def close(self):
                return None

        class Playwright:
            chromium = type("Chromium", (), {"launch": lambda self, **kwargs: Browser()})()

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return None

        scraper = StubScraper(
            self.scraper.base_url, 5, 0, 0, True, "test-agent"
        )
        with patch("scrapers.fincaraiz.sync_playwright", return_value=Playwright()):
            result = scraper.scrape(1)
        self.assertTrue(result.completa)
        self.assertEqual(result.next_page, 1)

    def test_inconsistent_current_page_aborts_without_advancing(self):
        class StubScraper(FincaraizScraper):
            def assert_robots_allowed(self, url):
                return None

            def fetch_next_data(self, page, url, attempts=2):
                return {
                    "props": {
                        "pageProps": {
                            "fetchResult": {
                                "searchFast": {
                                    "data": [{"id": 1}],
                                    "paginatorInfo": {"currentPage": 2},
                                }
                            }
                        }
                    }
                }

            def delay(self):
                return None

        class Context:
            def new_page(self):
                return object()

            def close(self):
                return None

        class Browser:
            def new_context(self, **kwargs):
                return Context()

            def close(self):
                return None

        class Playwright:
            chromium = type("Chromium", (), {"launch": lambda self, **kwargs: Browser()})()

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return None

        scraper = StubScraper(
            self.scraper.base_url, 1, 0, 0, True, "test-agent"
        )
        with patch("scrapers.fincaraiz.sync_playwright", return_value=Playwright()):
            result = scraper.scrape(1)
        self.assertTrue(result.aborted)
        self.assertEqual(result.pages_fetched, 0)
        self.assertEqual(result.next_page, 1)
        self.assertFalse(result.lease_lost)

    def test_lease_loss_is_reported(self):
        class Context:
            def new_page(self):
                return object()

            def close(self):
                return None

        class Browser:
            def new_context(self, **kwargs):
                return Context()

            def close(self):
                return None

        class Playwright:
            chromium = type("Chromium", (), {"launch": lambda self, **kwargs: Browser()})()

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return None

        with patch("scrapers.fincaraiz.sync_playwright", return_value=Playwright()):
            result = self.scraper.scrape(3, before_page=lambda: False)
        self.assertTrue(result.aborted)
        self.assertTrue(result.lease_lost)
        self.assertEqual(result.next_page, 3)


class ModelValidationTests(unittest.TestCase):
    def test_model_rejects_invalid_url_and_coordinates(self):
        values = {
            "id": "fincaraiz-1",
            "portalOrigen": "fincaraiz",
            "urlOriginal": "javascript:alert(1)",
            "valorCanon": 1000000,
            "tamanoM2": 50,
            "banos": 1,
            "latitud": 200,
        }
        with self.assertRaises(ValueError):
            InmuebleScraped(**values)


if __name__ == "__main__":
    unittest.main()
