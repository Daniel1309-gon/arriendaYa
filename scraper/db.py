import logging
from datetime import datetime, timezone

from pymongo import MongoClient, UpdateOne
from pymongo.errors import DuplicateKeyError
from pymongo.collection import Collection

from config import MONGO_COLLECTION, MONGO_DB, MONGO_URL

log = logging.getLogger("scraper")

META_COLLECTION = "scraper_meta"
LEASE_PREFIX = "lease:"

_client: MongoClient | None = None


def get_collection() -> Collection:
    global _client
    if _client is None:
        _client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
    return _client[MONGO_DB][MONGO_COLLECTION]


def get_meta_collection() -> Collection:
    global _client
    if _client is None:
        _client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
    return _client[MONGO_DB][META_COLLECTION]


def close_client() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None


def _colapsar_duplicados_por_id(col: Collection) -> int:
    """Deja un solo documento por `id`, conservando el más reciente.

    Con el esquema anterior la clave de upsert era `urlOriginal`, así que un
    inmueble que cambiaba de slug quedaba como dos documentos con el mismo
    `id`. Hay que colapsarlos antes de poder crear el índice único de `id`.
    Es seguro: esta colección es caché de scraping, reconstruible desde el
    portal (los datos de usuario viven en Postgres).
    """
    grupos = col.aggregate(
        [
            {"$group": {"_id": "$id", "docs": {"$push": "$_id"}, "n": {"$sum": 1}}},
            {"$match": {"n": {"$gt": 1}}},
        ]
    )
    borrados = 0
    for grupo in grupos:
        # El más reciente gana; el resto se descarta.
        conservar = col.find_one(
            {"id": grupo["_id"]}, sort=[("fechaScraping", -1)], projection={"_id": 1}
        )
        sobrantes = [d for d in grupo["docs"] if d != (conservar or {}).get("_id")]
        if sobrantes:
            borrados += col.delete_many({"_id": {"$in": sobrantes}}).deleted_count
    if borrados:
        log.warning(
            "Migración: %d documentos duplicados por `id` colapsados", borrados
        )
    return borrados


def _eliminar_documentos_sin_id(col: Collection) -> int:
    res = col.delete_many(
        {"$or": [{"id": {"$exists": False}}, {"id": None}, {"id": ""}]}
    )
    if res.deleted_count:
        log.warning(
            "Migración: %d documentos sin id eliminados de la caché de scraping",
            res.deleted_count,
        )
    return res.deleted_count


def _migrar_indices(col: Collection) -> None:
    """Migración idempotente desde el esquema anterior (clave = urlOriginal).

    Mongo rechaza `create_index` cuando ya existe un índice con el mismo
    nombre autogenerado y opciones distintas, así que redefinir urlOriginal
    de único a no-único requiere borrarlo primero. Sin esto ensure_indexes
    aborta con OperationFailure sobre cualquier base que venga del esquema
    anterior, y como es best-effort en main.py el fallo pasa desapercibido:
    los índices declarados después (los que sirven a GET /inmuebles) nunca
    se crean y el backend queda haciendo collection scan.
    """
    _eliminar_documentos_sin_id(col)
    info = col.index_information()
    id_indexes = [
        (name, spec)
        for name, spec in info.items()
        if spec.get("key") == [("id", 1)]
    ]
    if not any(spec.get("unique") for _, spec in id_indexes):
        _colapsar_duplicados_por_id(col)
        for name, _ in id_indexes:
            log.warning("Migración: reemplazando índice no único %s", name)
            col.drop_index(name)

    url_indexes = [
        (name, spec)
        for name, spec in info.items()
        if spec.get("key") == [("urlOriginal", 1)]
    ]
    for name, spec in url_indexes:
        if spec.get("unique"):
            log.warning("Migración: urlOriginal deja de ser único (el slug cambia)")
            col.drop_index(name)


def ensure_indexes() -> None:
    col = get_collection()
    _migrar_indices(col)
    # Clave de identidad estable. El slug de urlOriginal puede cambiar para
    # el mismo inmueble (p. ej. "...cedritos-bogota" → "...cedritos-zona-
    # norte-bogota"); upsertar por urlOriginal crearía duplicados.
    col.create_index("id", unique=True)
    col.create_index("urlOriginal")  # no único: ver comentario anterior
    # Soporta el filtro de marcar_inactivos (portal + activos vencidos).
    col.create_index([("portalOrigen", 1), ("activo", 1), ("fechaScraping", 1)])
    # Soportan los filtros de GET /inmuebles (backend/src/modules/inmuebles):
    # activo siempre está en el query, combinado con rango de precio o con
    # habitaciones/banos/estrato exactos.
    col.create_index([("activo", 1), ("valorCanon", 1)])
    col.create_index([("activo", 1), ("habitaciones", 1), ("banos", 1), ("estrato", 1)])


def upsert_inmuebles(docs: list[dict]) -> tuple[int, int]:
    if not docs:
        return 0, 0
    # Un inmueble puede repetirse entre páginas (p. ej. el destacado de
    # extract_listings); dedupe por id antes del bulk_write o dos UpdateOne
    # con upsert sobre la misma clave inexistente chocan con un duplicate
    # key error.
    deduped: dict[str, dict] = {d["id"]: d for d in docs}
    col = get_collection()
    ops = [
        UpdateOne({"id": id_}, {"$set": d}, upsert=True)
        for id_, d in deduped.items()
    ]
    res = col.bulk_write(ops, ordered=False)
    return res.upserted_count or 0, res.modified_count or 0


def get_cursor(portal: str) -> int:
    """Página desde la que arranca la próxima corrida (rotación de ventana)."""
    doc = get_meta_collection().find_one({"_id": f"cursor:{portal}"})
    if doc and isinstance(doc.get("nextPage"), int) and doc["nextPage"] >= 1:
        return doc["nextPage"]
    return 1


def set_cursor(portal: str, next_page: int, last_page: int) -> None:
    get_meta_collection().update_one(
        {"_id": f"cursor:{portal}"},
        {
            "$set": {
                "nextPage": next_page,
                "lastPage": last_page,
                "actualizadoEn": datetime.now(timezone.utc),
            }
        },
        upsert=True,
    )


def acquire_scrape_lease(portal: str, owner: str, ttl_seconds: int) -> bool:
    """Adquiere un lease para evitar dos scrapers rotando el mismo cursor."""
    now = datetime.now(timezone.utc)
    expires_at = now.timestamp() + ttl_seconds
    collection = get_meta_collection()
    lease_id = f"{LEASE_PREFIX}{portal}"
    try:
        collection.insert_one(
            {"_id": lease_id, "owner": owner, "expiresAt": expires_at}
        )
        return True
    except DuplicateKeyError:
        result = collection.update_one(
            {
                "_id": lease_id,
                "$or": [
                    {"expiresAt": {"$lte": now.timestamp()}},
                    {"expiresAt": {"$exists": False}},
                ],
            },
            {"$set": {"owner": owner, "expiresAt": expires_at}},
        )
        return result.modified_count == 1


def release_scrape_lease(portal: str, owner: str) -> None:
    get_meta_collection().delete_one(
        {"_id": f"{LEASE_PREFIX}{portal}", "owner": owner}
    )


def renew_scrape_lease(portal: str, owner: str, ttl_seconds: int) -> bool:
    result = get_meta_collection().update_one(
        {"_id": f"{LEASE_PREFIX}{portal}", "owner": owner},
        {"$set": {"expiresAt": datetime.now(timezone.utc).timestamp() + ttl_seconds}},
    )
    return result.matched_count == 1


def marcar_inactivos(portal: str, corte: datetime) -> int:
    """Marca activo=False los inmuebles del portal no refrescados desde `corte`.

    No usa "visto en esta corrida" como criterio: con paginación truncada
    (ver MAX_PAGINAS) una sola corrida nunca cubre el catálogo completo, así
    que comparar contra lo visto en cada corrida desactivaría inventario
    válido en cada ciclo. En cambio, un inmueble se desactiva sólo cuando
    lleva varias corridas sin reaparecer.
    """
    col = get_collection()
    res = col.update_many(
        {
            "portalOrigen": portal,
            "fechaScraping": {"$lt": corte},
            "activo": True,
        },
        {"$set": {"activo": False}},
    )
    return res.modified_count
