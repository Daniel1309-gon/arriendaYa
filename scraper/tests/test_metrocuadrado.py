import unittest
from datetime import datetime, timezone
from unittest.mock import Mock, patch
from urllib.parse import parse_qs, urlparse

from scrapers.metrocuadrado import (
    MetrocuadradoScraper,
    _merge_stored_detail,
    parse_built_time,
    parse_detail_html,
)
from models import InmuebleScraped
from scrapers.base import BaseScraper, BlockedException, PageUnavailableException


class MetrocuadradoMappingTests(unittest.TestCase):
    def setUp(self):
        self.scraper = MetrocuadradoScraper(
            base_url="https://www.metrocuadrado.com/inmuebles/arriendo/apartamentos/bogota/",
            search_url="https://www.metrocuadrado.com/rest-search/search",
            api_key="test-key",
            max_paginas=1,
            delay_min=0,
            delay_max=0,
            headless=True,
            user_agent="test-agent",
        )

    def test_map_item_normalizes_listing_fields_and_sanitizes_contacts(self):
        item = {
            "midinmueble": "17556-M6950198",
            "link": "/inmueble/arriendo-apartamento-bogota/17556-M6950198",
            "mvalorarriendo": "$2.300.000",
            "marea": "42.5 m²",
            "mnrocuartos": "2",
            "mnrobanos": "1",
            "mnrogarajes": "1",
            "mciudad": {"nombre": "Bogotá D.C."},
            "mbarrio": "CHAPINERO",
            "comment": "Escribe a ejemplo@test.com o llama al 320 123 4567.",
            "data": {"mvaloradministracion": "$150.000"},
            "contactPhone": "3201234567",
            "whatsapp": "573201234567",
            "imageLink": "https://multimedia.metrocuadrado.com/17556-M6950198/17556-M6950198_1_p.jpg",
            "mgaleriainmueble": [
                "17556-M6950198_1",
                "17556-M6950198_2",
                "17556-M6950198_3",
            ],
        }

        doc = self.scraper.map_item(item)

        self.assertIsNotNone(doc)
        assert doc is not None
        self.assertEqual(doc["id"], "metrocuadrado-17556-M6950198")
        self.assertEqual(doc["portalOrigen"], "metrocuadrado")
        self.assertEqual(doc["valorCanon"], 2300000)
        self.assertEqual(doc["valorAdministracion"], 150000)
        self.assertEqual(doc["tamanoM2"], 42.5)
        self.assertEqual(doc["habitaciones"], 2)
        self.assertEqual(doc["banos"], 1)
        self.assertEqual(doc["parqueaderos"], 1)
        self.assertEqual(doc["barrio"], "CHAPINERO")
        self.assertEqual(doc["ciudad"], "Bogotá D.C.")
        self.assertNotIn("@", doc["descripcion"])
        self.assertNotIn("320 123 4567", doc["descripcion"])
        self.assertNotIn("contactPhone", doc)
        self.assertNotIn("whatsapp", doc)

    def test_map_item_places_cover_first_deduplicates_and_caps_gallery(self):
        item = {
            "midinmueble": "M-1",
            "link": "/inmueble/arriendo-apartamento-bogota/M-1",
            "mvalorarriendo": 2000000,
            "marea": 50,
            "imageLink": "https://multimedia.metrocuadrado.com/M-1/M-1_1_p.jpg",
            "mgaleriainmueble": [
                "M-1_1",
                *[f"M-1_{number}" for number in range(2, 15)],
            ],
        }

        doc = self.scraper.map_item(item)

        assert doc is not None
        self.assertEqual(len(doc["imagenes"]), 10)
        self.assertEqual(
            doc["imagenes"][0],
            "https://multimedia.metrocuadrado.com/M-1/M-1_1_p.jpg",
        )
        self.assertEqual(
            doc["imagenes"][1],
            "https://multimedia.metrocuadrado.com/M-1/M-1_2_p.jpg",
        )

    def test_map_item_rejects_invalid_listing_url_or_price(self):
        base = {"midinmueble": "M-1", "mvalorarriendo": 2000000, "marea": 50}
        self.assertIsNone(self.scraper.map_item({**base, "link": "https://evil.test/x"}))
        self.assertIsNone(
            self.scraper.map_item(
                {**base, "link": "/inmueble/M-1", "mvalorarriendo": 0}
            )
        )


class MetrocuadradoDetailTests(unittest.TestCase):
    def setUp(self):
        self.scraper = MetrocuadradoScraper(
            base_url="https://www.metrocuadrado.com/inmuebles/arriendo/apartamentos/bogota/",
            search_url="https://www.metrocuadrado.com/rest-search/search",
            api_key="test-key",
            max_paginas=1,
            delay_min=0,
            delay_max=0,
            headless=True,
            user_agent="test-agent",
        )

    def test_parse_built_time_uses_lower_bound(self):
        self.assertEqual(parse_built_time("Entre 5 y 10 años"), 5)
        self.assertEqual(parse_built_time("Más de 20 años"), 20)
        self.assertEqual(parse_built_time("Nuevo"), 0)
        self.assertIsNone(parse_built_time("sin información"))

    def test_parse_detail_html_extracts_detail_data_from_rsc_payload(self):
        html = r'''<script>self.__next_f.push([1,"15:[\"$\",{\"data\":{\"detail\":{\"adminPrice\":350000},\"propertyId\":\"M-1\",\"coordinates\":{\"lon\":-74.0817,\"lat\":4.6097},\"featured\":[{\"title\":\"Interiores\",\"items\":[\"Número de piso 7\",\"Se Permiten Mascotas\",\"Ascensor\"]}],\"builtTime\":\"Entre 5 y 10 años\",\"stratum\":\"4\",\"ubicacionaproximada\":\"N\"}}]\n"])</script>'''

        detail = parse_detail_html(html, "M-1")

        self.assertEqual(detail["coordinates"], {"lon": -74.0817, "lat": 4.6097})
        self.assertEqual(detail["stratum"], "4")
        self.assertEqual(detail["builtTime"], "Entre 5 y 10 años")
        self.assertEqual(detail["detail"]["adminPrice"], 350000)

    def test_enrich_doc_uses_exact_coordinates_and_characteristics(self):
        html = r'''<script>self.__next_f.push([1,"15:[{\"detail\":{\"adminPrice\":350000},\"propertyId\":\"M-1\",\"coordinates\":{\"lon\":-74.0817,\"lat\":4.6097},\"featured\":[{\"title\":\"Interiores\",\"items\":[\"Número de piso 7\",\"Se Permiten Mascotas\",\"Ascensor\"]}],\"builtTime\":\"Entre 5 y 10 años\",\"stratum\":\"4\",\"ubicacionaproximada\":\"N\"}]\n"])</script>'''
        doc = {
            "id": "metrocuadrado-M-1",
            "portalOrigen": "metrocuadrado",
            "urlOriginal": "https://www.metrocuadrado.com/inmueble/M-1",
            "valorCanon": 2000000,
            "tamanoM2": 50,
            "banos": 1,
        }

        enriched = self.scraper.enrich_doc(doc, html)

        self.assertEqual(enriched["valorAdministracion"], 350000)
        self.assertEqual(enriched["latitud"], 4.6097)
        self.assertEqual(enriched["longitud"], -74.0817)
        self.assertEqual(enriched["estrato"], 4)
        self.assertEqual(enriched["antiguedadAnos"], 5)
        self.assertEqual(enriched["piso"], 7)
        self.assertTrue(enriched["ascensor"])
        self.assertTrue(enriched["petFriendly"])

    def test_approximate_coordinates_are_not_persisted(self):
        html = r'''<script>self.__next_f.push([1,"15:[{\"propertyId\":\"M-1\",\"coordinates\":{\"lon\":-74.0817,\"lat\":4.6097},\"ubicacionaproximada\":\"S\"}]\n"])</script>'''
        doc = {
            "id": "metrocuadrado-M-1",
            "portalOrigen": "metrocuadrado",
            "urlOriginal": "https://www.metrocuadrado.com/inmueble/M-1",
            "valorCanon": 2000000,
            "tamanoM2": 50,
            "banos": 1,
        }

        enriched = self.scraper.enrich_doc(doc, html)

        self.assertIsNone(enriched["latitud"])
        self.assertIsNone(enriched["longitud"])

    def test_coordinates_without_exact_flag_are_not_persisted(self):
        flags = {
            "missing": "",
            "null": r',\"ubicacionaproximada\":null',
            "unknown": r',\"ubicacionaproximada\":\"X\"',
        }
        for label, flag in flags.items():
            with self.subTest(flag=label):
                html = (
                    r'<script>self.__next_f.push([1,"15:[{\"propertyId\":\"M-1\",'
                    r'\"coordinates\":{\"lon\":-74.0817,\"lat\":4.6097}'
                    + flag
                    + r'}]\n"])</script>'
                )
                doc = {
                    "id": "metrocuadrado-M-1",
                    "portalOrigen": "metrocuadrado",
                    "urlOriginal": "https://www.metrocuadrado.com/inmueble/M-1",
                    "valorCanon": 2000000,
                    "tamanoM2": 50,
                    "banos": 1,
                }

                enriched = self.scraper.enrich_doc(doc, html)

                self.assertIsNone(enriched["latitud"])
                self.assertIsNone(enriched["longitud"])

    def test_existing_detail_is_merged_without_being_erased_by_listing_update(self):
        doc = {
            "id": "metrocuadrado-M-1",
            "estrato": None,
            "ascensor": False,
            "latitud": None,
        }

        has_detail = _merge_stored_detail(
            doc,
            {"estrato": 4, "ascensor": True, "latitud": 4.6},
        )

        self.assertTrue(has_detail)
        self.assertEqual(doc["estrato"], 4)
        self.assertTrue(doc["ascensor"])
        self.assertEqual(doc["latitud"], 4.6)

    def test_model_rejects_malformed_metro_image_path(self):
        values = {
            "id": "metrocuadrado-M-1",
            "portalOrigen": "metrocuadrado",
            "urlOriginal": "https://www.metrocuadrado.com/inmueble/M-1",
            "valorCanon": 2000000,
            "tamanoM2": 50,
            "banos": 1,
            "imagenes": [
                "https://multimedia.metrocuadrado.com/M-1/M-1_1_p.jpg",
                "https://multimedia.metrocuadrado.com/other/unsafe.jpg",
                "https://multimedia.metrocuadrado.com/M-1/other_1_p.jpg",
            ],
        }

        model = InmuebleScraped(**values)

        self.assertEqual(
            model.imagenes,
            ["https://multimedia.metrocuadrado.com/M-1/M-1_1_p.jpg"],
        )


class MetrocuadradoPaginationTests(unittest.TestCase):
    def test_search_url_sends_explicit_filters_and_offset(self):
        scraper = MetrocuadradoScraper(
            base_url="https://www.metrocuadrado.com/inmuebles/arriendo/apartamentos/bogota/",
            search_url="https://www.metrocuadrado.com/rest-search/search",
            api_key="test-key",
            max_paginas=1,
            delay_min=0,
            delay_max=0,
            headless=True,
            user_agent="test-agent",
            page_size=50,
        )

        query = parse_qs(urlparse(scraper._search_url(100)).query)

        self.assertEqual(query["from"], ["100"])
        self.assertEqual(query["size"], ["50"])
        self.assertEqual(query["realEstateTypeList"], ["apartamento"])
        self.assertEqual(query["realEstateBusinessList"], ["arriendo"])
        self.assertEqual(query["city"], ["bogota"])

    def test_stale_offset_wraps_to_zero(self):
        class StubScraper(MetrocuadradoScraper):
            def assert_robots_allowed(self, url):
                return None

            def navigate(self, page, url, attempts=2):
                return None

            def fetch_search_json(self, page, url, api_key, attempts=2):
                offset = int(parse_qs(urlparse(url).query)["from"][0])
                if offset > 0:
                    return {"totalHits": 1, "totalEntries": 2, "results": []}
                return {
                    "totalHits": 1,
                    "totalEntries": 2,
                    "results": [{"id": "one"}],
                }

            def map_item(self, item):
                return {"id": f"metrocuadrado-{item['id']}"}

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
            chromium = type(
                "Chromium", (), {"launch": lambda self, **kwargs: Browser()}
            )()

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return None

        scraper = StubScraper(
            base_url="https://www.metrocuadrado.com/inmuebles/arriendo/apartamentos/bogota/",
            search_url="https://www.metrocuadrado.com/rest-search/search",
            api_key="test-key",
            max_paginas=2,
            delay_min=0,
            delay_max=0,
            headless=True,
            user_agent="test-agent",
            page_size=2,
            enrich_details=False,
        )

        with patch("scrapers.metrocuadrado.sync_playwright", return_value=Playwright()):
            result = scraper.scrape(start_from=10)

        self.assertTrue(result.completa)
        self.assertEqual(result.next_page, 0)
        self.assertEqual(result.pages_fetched, 1)
        self.assertEqual(result.docs, [{"id": "metrocuadrado-one"}])
        self.assertFalse(result.lease_lost)

        with patch("scrapers.metrocuadrado.sync_playwright", return_value=Playwright()):
            result = scraper.scrape(start_from=10, before_page=lambda: False)

        self.assertTrue(result.aborted)
        self.assertTrue(result.lease_lost)
        self.assertEqual(result.next_page, 10)


class BaseScraperHttpTests(unittest.TestCase):
    def test_search_http_4xx_is_blocked_instead_of_empty_results(self):
        class Page:
            def evaluate(self, script, argument):
                return {"status": 422, "body": '{"results": []}'}

        scraper = BaseScraper(
            base_url="https://example.test/listado",
            max_paginas=1,
            delay_min=0,
            delay_max=0,
            headless=True,
            user_agent="test-agent",
        )

        with self.assertRaises(BlockedException):
            scraper.fetch_search_json(Page(), "https://example.test/api", "test-key")

    def _navigate(self, status, final_url):
        class Page:
            url = final_url

            def goto(self, url, **kwargs):
                return type("Response", (), {"status": status})()

        scraper = BaseScraper(
            base_url="https://example.test/listado",
            max_paginas=1,
            delay_min=0,
            delay_max=0,
            headless=True,
            user_agent="test-agent",
        )
        scraper.navigate(Page(), "https://example.test/inmueble/1")

    def test_missing_page_is_unavailable_not_a_block(self):
        for status in (404, 410):
            with self.subTest(status=status):
                with self.assertRaises(PageUnavailableException) as ctx:
                    self._navigate(status, "https://example.test/inmueble/1")
                self.assertEqual(ctx.exception.status, status)

    def test_same_origin_redirect_is_unavailable(self):
        with self.assertRaises(PageUnavailableException) as ctx:
            self._navigate(200, "https://example.test/inmuebles/arriendo")
        self.assertIsNone(ctx.exception.status)

    def test_real_blocks_are_not_unavailable(self):
        cases = {
            "403": (403, "https://example.test/inmueble/1"),
            "429": (429, "https://example.test/inmueble/1"),
            "cross-origin": (200, "https://captcha.example.org/inmueble/1"),
        }
        for label, (status, final_url) in cases.items():
            with self.subTest(case=label):
                with self.assertRaises(BlockedException) as ctx:
                    self._navigate(status, final_url)
                self.assertNotIsInstance(ctx.exception, PageUnavailableException)


class MetrocuadradoEnrichLoopTests(unittest.TestCase):
    def _scraper(self, failures):
        class StubScraper(MetrocuadradoScraper):
            fetched: list[str] = []

            def assert_robots_allowed(self, url):
                return None

            def fetch_page_html(self, page, url, attempts=2):
                self.fetched.append(url)
                if url in failures:
                    raise failures[url]
                return "<html></html>"

            def enrich_doc(self, doc, html):
                return {**doc, "estrato": 4}

            def delay(self):
                return None

        return StubScraper(
            base_url="https://www.metrocuadrado.com/inmuebles/arriendo/apartamentos/bogota/",
            search_url="https://www.metrocuadrado.com/rest-search/search",
            api_key="test-key",
            max_paginas=1,
            delay_min=0,
            delay_max=0,
            headless=True,
            user_agent="test-agent",
        )

    @staticmethod
    def _docs():
        return [
            {"id": f"metrocuadrado-M-{n}", "urlOriginal": f"https://www.metrocuadrado.com/inmueble/M-{n}"}
            for n in (1, 2)
        ]

    def test_unavailable_detail_is_skipped_and_enrich_continues(self):
        docs = self._docs()
        scraper = self._scraper(
            {docs[0]["urlOriginal"]: PageUnavailableException("HTTP 404", 404)}
        )

        with patch("db.get_existing_docs", return_value={}):
            self.assertTrue(scraper._enrich_new_docs(object(), docs, None))

        self.assertNotIn("estrato", docs[0])
        self.assertEqual(docs[1]["estrato"], 4)

    def test_block_on_detail_still_halts_enrich(self):
        docs = self._docs()
        scraper = self._scraper(
            {docs[0]["urlOriginal"]: BlockedException("HTTP 403")}
        )

        with patch("db.get_existing_docs", return_value={}):
            self.assertTrue(scraper._enrich_new_docs(object(), docs, None))

        self.assertEqual(scraper.fetched, [docs[0]["urlOriginal"]])
        self.assertNotIn("estrato", docs[1])
        self.assertNotIn("detalleIntentadoEn", docs[0])

    def test_unavailable_detail_is_marked_as_attempted(self):
        docs = self._docs()
        scraper = self._scraper(
            {docs[0]["urlOriginal"]: PageUnavailableException("HTTP 404", 404)}
        )

        with patch("db.get_existing_docs", return_value={}):
            scraper._enrich_new_docs(object(), docs, None)

        self.assertIsInstance(docs[0]["detalleIntentadoEn"], datetime)

    def test_redirected_detail_is_skipped_but_retried_next_run(self):
        docs = self._docs()
        scraper = self._scraper(
            {docs[0]["urlOriginal"]: PageUnavailableException("Redirección")}
        )

        with patch("db.get_existing_docs", return_value={}):
            scraper._enrich_new_docs(object(), docs, None)

        self.assertNotIn("detalleIntentadoEn", docs[0])
        self.assertEqual(docs[1]["estrato"], 4)

    def test_previously_attempted_detail_is_not_revisited(self):
        docs = self._docs()
        scraper = self._scraper({})
        stored = {
            docs[0]["id"]: {
                "id": docs[0]["id"],
                "estrato": None,
                "detalleIntentadoEn": datetime.now(timezone.utc),
            }
        }

        with patch("db.get_existing_docs", return_value=stored):
            scraper._enrich_new_docs(object(), docs, None)

        self.assertEqual(scraper.fetched, [docs[1]["urlOriginal"]])


class MetrocuadradoDetailAttemptTests(unittest.TestCase):
    def setUp(self):
        self.scraper = MetrocuadradoScraper(
            base_url="https://www.metrocuadrado.com/inmuebles/arriendo/apartamentos/bogota/",
            search_url="https://www.metrocuadrado.com/rest-search/search",
            api_key="test-key",
            max_paginas=1,
            delay_min=0,
            delay_max=0,
            headless=True,
            user_agent="test-agent",
        )
        self.doc = {
            "id": "metrocuadrado-M-1",
            "portalOrigen": "metrocuadrado",
            "urlOriginal": "https://www.metrocuadrado.com/inmueble/M-1",
            "valorCanon": 2000000,
            "tamanoM2": 50,
            "banos": 1,
        }

    def test_empty_detail_is_marked_as_attempted(self):
        html = r'''<script>self.__next_f.push([1,"15:[{\"propertyId\":\"M-1\"}]\n"])</script>'''

        enriched = self.scraper.enrich_doc(self.doc, html)

        self.assertIsNone(enriched["estrato"])
        self.assertIsInstance(enriched["detalleIntentadoEn"], datetime)

    def test_unparseable_detail_is_not_marked(self):
        enriched = self.scraper.enrich_doc(self.doc, "<html>captcha</html>")

        self.assertNotIn("detalleIntentadoEn", enriched)

    def test_listing_refresh_does_not_overwrite_attempt_marker(self):
        doc = self.scraper.map_item(
            {
                "midinmueble": "M-1",
                "link": "/inmueble/M-1",
                "mvalorarriendo": 2000000,
                "marea": 50,
            }
        )

        # upsert_inmuebles hace $set del doc: si trajera la clave (aunque
        # fuera None) borraría la marca guardada.
        assert doc is not None
        self.assertNotIn("detalleIntentadoEn", doc)


class ScraperDatabaseTests(unittest.TestCase):
    def test_existing_docs_returns_only_requested_portal_fields(self):
        import db

        collection = Mock()
        collection.find.return_value = [
            {"id": "metrocuadrado-M-1", "estrato": 4, "ascensor": True},
            {"id": "metrocuadrado-M-2", "piso": 8},
        ]

        with patch("db.get_collection", return_value=collection):
            docs = db.get_existing_docs(
                "metrocuadrado", ["metrocuadrado-M-1", "metrocuadrado-M-2"]
            )

        self.assertEqual(docs["metrocuadrado-M-1"]["estrato"], 4)
        self.assertTrue(docs["metrocuadrado-M-1"]["ascensor"])
        self.assertEqual(docs["metrocuadrado-M-2"]["piso"], 8)
        projection = collection.find.call_args.kwargs["projection"]
        self.assertEqual(projection["detalleIntentadoEn"], 1)


if __name__ == "__main__":
    unittest.main()
