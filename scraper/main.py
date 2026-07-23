import os
from pymongo import MongoClient
from pymongo.collection import Collection
from apscheduler.schedulers.blocking import BlockingScheduler
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

MONGO_URL = os.getenv("MONGO_URL")


def get_mongo_collection() -> Collection:
    client = MongoClient(MONGO_URL)
    db = client.arriendaya_scraper
    return db.inmuebles_scrapeados


def scrape_mock():
    print(f"Scraping mock data at {datetime.now(timezone.utc)}")

    inmuebles = [
        {
            "id": "mock-finca-1",
            "portalOrigen": "fincaraiz",
            "urlOriginal": "https://fincaraiz.com/mock-1",
            "valorCanon": 1500000,
            "administracionIncluida": True,
            "tamanoM2": 45,
            "habitaciones": 1,
            "banos": 1,
            "patio": False,
            "parqueaderos": 0,
            "antiguedadAnos": 5,
            "estrato": 4,
            "piso": 3,
            "ascensor": True,
            "petFriendly": True,
            "latitud": 4.6097,
            "longitud": -74.0817,
            "descripcion": "Acogedor apartamento de una habitación en zona central, cerca a transporte público y zonas comerciales. Ideal para una persona o pareja joven.",
            "fechaScraping": datetime.now(timezone.utc),
        },
        {
            "id": "mock-metro-1",
            "portalOrigen": "metrocuadrado",
            "urlOriginal": "https://metrocuadrado.com/mock-1",
            "valorCanon": 2800000,
            "administracionIncluida": False,
            "valorAdministracion": 300000,
            "tamanoM2": 90,
            "habitaciones": 3,
            "banos": 2,
            "patio": True,
            "parqueaderos": 1,
            "antiguedadAnos": 10,
            "estrato": 5,
            "piso": 1,
            "ascensor": False,
            "petFriendly": True,
            "latitud": 4.6997,
            "longitud": -74.0417,
            "descripcion": "Amplio apartamento familiar de tres habitaciones con patio privado y parqueadero. Ubicado en sector residencial tranquilo, con fácil acceso a colegios y supermercados.",
            "fechaScraping": datetime.now(timezone.utc),
        },
    ]

    collection = get_mongo_collection()

    nuevos = 0
    actualizados = 0

    for inmueble in inmuebles:
        resultado = collection.update_one(
            {"urlOriginal": inmueble["urlOriginal"]}, {"$set": inmueble}, upsert=True
        )

        if resultado.upserted_id:
            nuevos += 1
        else:
            actualizados += 1

    print(f"Scraping results: {nuevos} nuevos, {actualizados} actualizados")


if __name__ == "__main__":
    print("Starting the scraper...")

    scrape_mock()  # Run the scraper immediately on startup

    scheduler = BlockingScheduler()
    scheduler.add_job(scrape_mock, "interval", hours=3)  # Schedule the

    print("Scheduler started. Scraping will run every 3 hours.")

    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        print("Scheduler stopped.")
