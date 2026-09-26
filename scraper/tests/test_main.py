import unittest
from unittest.mock import Mock, patch

import main
from scrapers.base import ScrapeResult


def _result(**overrides):
    values = {
        "docs": [{"id": "fincaraiz-1"}],
        "completa": False,
        "next_page": 8,
        "last_page": 40,
        "pages_fetched": 3,
        "raw_items": 60,
        "mapped_items": 60,
        "aborted": True,
        "abort_reason": "HTTP 403",
    }
    values.update(overrides)
    return ScrapeResult(**values)


class RunScrapeCursorTests(unittest.TestCase):
    def _run(self, result):
        scraper = Mock()
        scraper.scrape.return_value = result
        db = {
            "acquire_scrape_lease": Mock(return_value=True),
            "ensure_indexes": Mock(),
            "get_cursor": Mock(return_value=5),
            "upsert_inmuebles": Mock(return_value=(1, 0)),
            "marcar_inactivos": Mock(return_value=0),
            "set_cursor": Mock(),
            "release_scrape_lease": Mock(),
        }
        with patch.multiple(main, **db), patch.object(
            main, "_build_scraper", return_value=scraper
        ), patch.object(main, "MIN_ITEMS_PER_RUN", 1):
            main.run_scrape("fincaraiz")
        return db

    def test_blocked_run_keeps_cursor_progress_without_marking_inactive(self):
        db = self._run(_result())

        db["upsert_inmuebles"].assert_called_once()
        db["set_cursor"].assert_called_once_with("fincaraiz", 8, 40)
        db["marcar_inactivos"].assert_not_called()

    def test_aborted_run_without_last_page_keeps_stored_last_page(self):
        db = self._run(_result(last_page=None))

        db["set_cursor"].assert_called_once_with("fincaraiz", 8, None)

    def test_lease_loss_does_not_touch_cursor(self):
        db = self._run(
            _result(abort_reason="se perdió el lease de scraping", lease_lost=True)
        )

        db["set_cursor"].assert_not_called()
        db["marcar_inactivos"].assert_not_called()

    def test_complete_run_moves_cursor_and_marks_inactive(self):
        db = self._run(_result(aborted=False, abort_reason=None))

        db["set_cursor"].assert_called_once_with("fincaraiz", 8, 40)
        db["marcar_inactivos"].assert_called_once()


if __name__ == "__main__":
    unittest.main()
