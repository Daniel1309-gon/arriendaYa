import type { Inmueble } from "../../../generated/prisma/client";
import type { WithId, Document } from "mongodb";

/**
 * Forma común de los inmuebles que salen por la API.
 *
 * Las dos fuentes no coinciden: Postgres devuelve las columnas de Prisma (con
 * Decimal serializado como string) y Mongo devuelve el documento entero que
 * escribió el scraper, incluido `_id`. Además `imagenes` sólo existe en los
 * documentos re-scrapeados desde que se añadió el campo, y el barrido completo
 * del catálogo tarda ~8 días, así que durante ese tiempo conviven documentos
 * con y sin la clave.
 *
 * Normalizar acá evita repartir guards por cada consumidor: el cliente siempre
 * recibe `imagenes` como array y nunca ve `_id`.
 */
export type InmuebleSerializado = Record<string, unknown> & {
  id: string;
  imagenes: string[];
};

function urlHttpSegura(valor: unknown): string | undefined {
  if (typeof valor !== "string" || !valor) return undefined;
  try {
    const parsed = new URL(valor);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? valor
      : undefined;
  } catch {
    return undefined;
  }
}

function esImagenPermitida(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.port ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    !/\.(?:jpe?g|png|webp)$/i.test(parsed.pathname)
  ) {
    return false;
  }

  const partes = parsed.pathname.split("/");
  const esCloudinary =
    parsed.hostname === "res.cloudinary.com" &&
    partes[1] &&
    partes[2] === "image" &&
    partes[3] === "upload" &&
    partes.length > 4;
  const hostPortal = parsed.hostname;
  const esPortal =
    hostPortal === "d3s5pkt10pk3ga.cloudfront.net" ||
    hostPortal === "infocasas.com.uy" ||
    hostPortal.endsWith(".infocasas.com.uy") ||
    hostPortal === "fincaraiz.com.co" ||
    hostPortal.endsWith(".fincaraiz.com.co");

  return esCloudinary || (esPortal && parsed.pathname.startsWith("/repo/img/"));
}

function imagenesDe(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter(
    (url): url is string => typeof url === "string" && esImagenPermitida(url),
  );
}

export function serializarInmueblePropio(inmueble: Inmueble): InmuebleSerializado {
  return {
    ...inmueble,
    url: urlHttpSegura(inmueble.url),
    imagenes: imagenesDe(inmueble.imagenes),
  };
}

export function serializarInmuebleScrapeado(
  doc: WithId<Document>,
): InmuebleSerializado {
  const { _id, ...resto } = doc;
  return {
    ...resto,
    id: String(resto.id ?? _id),
    url: urlHttpSegura(resto.url),
    urlOriginal: urlHttpSegura(resto.urlOriginal),
    imagenes: imagenesDe(resto.imagenes),
  };
}
