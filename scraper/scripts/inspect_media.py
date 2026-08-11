"""Inspecciona el __NEXT_DATA__ de Fincaraiz para localizar las URLs de fotos.

Script de descubrimiento, no forma parte de la corrida. Uso:

    uv run python scripts/inspect_media.py [--dump]

Imprime las claves de nivel superior del primer anuncio y toda ruta cuyo valor
sea un string con pinta de imagen, para saber qué clave hay que mapear en
FincaraizScraper.map_item. Con --dump escribe además el anuncio completo a
scripts/_item_sample.json.

Lo que reveló en 2026-08: las fotos vienen en `item.images` (lista de
{id, image, tag}) y la portada se repite en `item.img`. Las URLs son la
resolución completa servida por cdn2.infocasas.com.uy (InfoCasas opera
fincaraiz.com.co). Insertar `th.outside{W}x{H}.` justo después de /repo/img/
devuelve una variante redimensionada: la de 384x275 pesa 18 KB contra los
420 KB de la original.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from playwright.sync_api import sync_playwright  # noqa: E402

from config import (  # noqa: E402
    DELAY_MAX_S,
    DELAY_MIN_S,
    FINCARAIZ_BASE_URL,
    HEADLESS,
    USER_AGENT,
)
from scrapers.fincaraiz import FincaraizScraper  # noqa: E402

IMAGE_HINTS = ("cdn4.fincaraiz", "cloudfront", ".jpg", ".jpeg", ".webp", ".png")


def walk(node, path="item"):
    """Devuelve [(ruta, valor)] de todo string que parezca una URL de imagen."""
    hits = []
    if isinstance(node, dict):
        for key, value in node.items():
            hits.extend(walk(value, f"{path}.{key}"))
    elif isinstance(node, list):
        for index, value in enumerate(node):
            hits.extend(walk(value, f"{path}[{index}]"))
    elif isinstance(node, str):
        lowered = node.lower()
        if any(hint in lowered for hint in IMAGE_HINTS):
            hits.append((path, node))
    return hits


def shape(node, depth=0):
    """Describe la forma de un valor sin volcarlo entero."""
    if isinstance(node, dict):
        return "{" + ", ".join(sorted(node.keys())) + "}"
    if isinstance(node, list):
        if not node:
            return "[] (vacía)"
        return f"lista de {len(node)} × {shape(node[0], depth + 1)}"
    return type(node).__name__


def main():
    scraper = FincaraizScraper(
        base_url=FINCARAIZ_BASE_URL,
        max_paginas=1,
        delay_min=DELAY_MIN_S,
        delay_max=DELAY_MAX_S,
        headless=HEADLESS,
        user_agent=USER_AGENT,
    )
    url = scraper.page_url(1)
    scraper.assert_robots_allowed(url)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=scraper.headless)
        try:
            context = browser.new_context(user_agent=scraper.user_agent, locale="es-CO")
            page = context.new_page()
            next_data = scraper.fetch_next_data(page, url)
        finally:
            browser.close()

    items, _ = scraper.extract_listings(next_data)
    if not items:
        print("Sin anuncios en la página; no hay nada que inspeccionar.")
        return 1

    item = items[0]
    print(f"=== {len(items)} anuncios. Claves del primero ===")
    for key in sorted(item.keys()):
        print(f"  {key:<28} {shape(item[key])}")

    print("\n=== Strings con pinta de imagen (primer anuncio) ===")
    hits = walk(item)
    if not hits:
        print("  NINGUNO. Las fotos no vienen en el payload de esta página.")
    for path, value in hits:
        print(f"  {path}\n      {value}")

    print("\n=== Claves de imagen presentes en los demás anuncios ===")
    roots = {}
    for other in items:
        for path, _ in walk(other):
            root = path.split("[")[0].split(".")[1] if "." in path else path
            roots[root] = roots.get(root, 0) + 1
    for root, count in sorted(roots.items(), key=lambda kv: -kv[1]):
        print(f"  item.{root:<24} aparece en {count} rutas")

    if "--dump" in sys.argv:
        dump = Path(__file__).with_name("_item_sample.json")
        dump.write_text(json.dumps(item, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\nAnuncio completo volcado en {dump} (no se versiona, borrar al terminar).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
