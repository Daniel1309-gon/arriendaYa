from datetime import datetime, timezone
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, field_validator

MAX_IMAGENES = 10
# Las fotos de Fincaraiz las sirve el CDN de InfoCasas (opera el portal), y
# los anuncios más nuevos salen por CloudFront. Se guarda la URL, no el
# archivo: la card hace hotlink contra estos hosts, así que la lista es a la
# vez whitelist de origen y defensa contra que el payload nos cuele cualquier
# otra URL.
IMAGE_HOST_SUFFIXES = (".infocasas.com.uy", ".fincaraiz.com.co")
IMAGE_HOSTS = frozenset({"d3s5pkt10pk3ga.cloudfront.net"})


class InmuebleScraped(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(min_length=1)
    portalOrigen: str = Field(min_length=1)
    urlOriginal: str
    valorCanon: int = Field(gt=0)
    administracionIncluida: bool = False
    valorAdministracion: int | None = Field(default=None, ge=0)
    tamanoM2: FiniteFloat = Field(gt=0)
    habitaciones: int = Field(default=0, ge=0)
    banos: int = Field(ge=0)
    patio: bool = False
    parqueaderos: int = Field(default=0, ge=0)
    antiguedadAnos: int | None = Field(default=None, ge=0, le=200)
    estrato: int | None = Field(default=None, ge=1, le=6)
    piso: int | None = Field(default=None, ge=-10, le=200)
    ascensor: bool = False
    petFriendly: bool = False
    latitud: FiniteFloat | None = Field(default=None, ge=-90, le=90)
    longitud: FiniteFloat | None = Field(default=None, ge=-180, le=180)
    descripcion: str | None = Field(default=None, max_length=2000)
    imagenes: list[str] = Field(default_factory=list, max_length=MAX_IMAGENES)
    barrio: str | None = None
    ciudad: str | None = None
    fechaScraping: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    activo: bool = True

    @field_validator("urlOriginal")
    @classmethod
    def _url_original(cls, v: str) -> str:
        parsed = urlparse(v)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("urlOriginal debe ser una URL HTTP(S) absoluta")
        return v

    @field_validator("imagenes", mode="before")
    @classmethod
    def _imagenes(cls, v) -> list[str]:
        """Filtra a URLs https de hosts conocidos, deduplica y corta a 10.

        Nunca lanza: un inmueble sin fotos utilizables sigue siendo válido, se
        queda con la lista vacía y la card cae al placeholder. Corre en modo
        `before` para poder descartar entradas que ni siquiera son str sin que
        la validación de tipo aborte el inmueble entero.
        """
        if not isinstance(v, list):
            return []
        urls: list[str] = []
        vistas: set[str] = set()
        for raw in v:
            if not isinstance(raw, str):
                continue
            url = raw.strip()
            if not url or url in vistas:
                continue
            parsed = urlparse(url)
            host = (parsed.hostname or "").lower()
            if parsed.scheme != "https":
                continue
            if host not in IMAGE_HOSTS and not host.endswith(IMAGE_HOST_SUFFIXES):
                continue
            vistas.add(url)
            urls.append(url)
            if len(urls) == MAX_IMAGENES:
                break
        return urls

    @field_validator("estrato")
    @classmethod
    def _estrato(cls, v: int | None) -> int | None:
        return v
