from datetime import datetime, timezone
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, field_validator


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

    @field_validator("estrato")
    @classmethod
    def _estrato(cls, v: int | None) -> int | None:
        return v
