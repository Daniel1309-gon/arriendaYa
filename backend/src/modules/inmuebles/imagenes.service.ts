import { v2 as cloudinary } from "cloudinary";
import sharp from "sharp";

export const MAX_IMAGENES_POR_INMUEBLE = 10;
export const MAX_BYTES_POR_IMAGEN = 5 * 1024 * 1024;
export const MAX_BYTES_TOTALES_POR_SOLICITUD = 25 * 1024 * 1024;
export const MAX_PIXELES_POR_IMAGEN = 25_000_000;
export const MAX_DIMENSION_POR_IMAGEN = 8_000;

const FORMATOS_ENTRADA_PERMITIDOS = new Set(["jpeg", "png", "webp"]);
const FORMATO_SALIDA = "webp";
const PUBLIC_ID_PROPIO = /^rentia\/inmuebles\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/;
const OPCIONES_BORRADO = {
  resource_type: "image",
  type: "upload",
  invalidate: true,
};

/** Error de configuración, distinguible para responder 503 en vez de 500. */
export class CloudinaryNoConfigurado extends Error {
  constructor() {
    super(
      "CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET deben estar configuradas",
    );
    this.name = "CloudinaryNoConfigurado";
  }
}

/** Error público para no filtrar detalles del parser de imágenes. */
export class ImagenNoValida extends Error {
  constructor() {
    super("La imagen no es válida o supera los límites permitidos");
    this.name = "ImagenNoValida";
  }
}

let configurado = false;

/**
 * Configura el SDK la primera vez que se usa.
 *
 * A diferencia de mailer.ts, que exige RESEND_API_KEY al importarse, acá la
 * validación es perezosa: sin Cloudinary la app sigue arrancando y la
 * cuadrícula (que usa las fotos scrapeadas, no estas) funciona igual. Sólo
 * falla quien intente subir.
 */
function configurar(): void {
  if (configurado) return;

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new CloudinaryNoConfigurado();
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
  configurado = true;
}

/**
 * Decodifica y vuelve a codificar la imagen para descartar payloads añadidos,
 * metadata innecesaria y formatos activos. El MIME y los magic bytes sólo son
 * pistas: la validación real es que Sharp pueda leer todos los píxeles.
 */
export async function normalizarImagen(buffer: Buffer): Promise<Buffer> {
  if (buffer.length === 0 || buffer.length > MAX_BYTES_POR_IMAGEN) {
    throw new ImagenNoValida();
  }

  try {
    const opciones = {
      // Sin `failOn` explícito Sharp usa "warning", su nivel más estricto: un
      // archivo con cualquier anomalía de decodificación se rechaza en vez de
      // repararse en silencio.
      limitInputChannels: 4,
      limitInputPixels: MAX_PIXELES_POR_IMAGEN,
      sequentialRead: true,
    };
    const metadata = await sharp(buffer, opciones).metadata();

    if (
      !metadata.format ||
      !FORMATOS_ENTRADA_PERMITIDOS.has(metadata.format) ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > MAX_DIMENSION_POR_IMAGEN ||
      metadata.height > MAX_DIMENSION_POR_IMAGEN ||
      metadata.width * metadata.height > MAX_PIXELES_POR_IMAGEN ||
      (metadata.pages !== undefined && metadata.pages > 1)
    ) {
      throw new ImagenNoValida();
    }

    const normalizada = await sharp(buffer, opciones)
      .rotate()
      .webp({ quality: 82, effort: 4 })
      .toBuffer();

    if (normalizada.length === 0 || normalizada.length > MAX_BYTES_POR_IMAGEN) {
      throw new ImagenNoValida();
    }

    return normalizada;
  } catch (error) {
    if (error instanceof ImagenNoValida) throw error;
    throw new ImagenNoValida();
  }
}

interface DestinoImagen {
  usuarioId: string;
  inmuebleId: string;
}

export interface ImagenSubida {
  url: string;
  publicId: string;
}

export async function subirImagen(
  buffer: Buffer,
  { usuarioId, inmuebleId }: DestinoImagen,
): Promise<ImagenSubida> {
  configurar();

  return new Promise<ImagenSubida>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `rentia/inmuebles/${usuarioId}/${inmuebleId}`,
        resource_type: "image",
        allowed_formats: [FORMATO_SALIDA],
        format: FORMATO_SALIDA,
      },
      (error, result) => {
        if (error) return reject(error);
        if (!result?.secure_url || !result.public_id) {
          return reject(new Error("Cloudinary no devolvió una URL de la imagen"));
        }
        if (
          publicIdDesdeUrl(result.secure_url) !== result.public_id ||
          !PUBLIC_ID_PROPIO.test(result.public_id)
        ) {
          return reject(new Error("Cloudinary devolvió una URL no válida"));
        }
        resolve({ url: result.secure_url, publicId: result.public_id });
      },
    );
    stream.end(buffer);
  });
}

/**
 * Extrae el public_id de una secure_url de Cloudinary.
 *
 * Formato: https://res.cloudinary.com/<cloud>/image/upload/v<ver>/<public_id>.<ext>
 * Devuelve null si la URL no tiene esa forma; quien llama ya verificó además
 * que la URL estuviera en el array del inmueble, así que esto sólo evita
 * llamar a destroy() con basura.
 */
export function publicIdDesdeUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (
    !cloudName ||
    parsed.protocol !== "https:" ||
    parsed.hostname !== "res.cloudinary.com" ||
    parsed.port ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    return null;
  }

  const partes = parsed.pathname.split("/");
  if (
    partes[1] !== cloudName ||
    partes[2] !== "image" ||
    partes[3] !== "upload"
  ) {
    return null;
  }

  let resto = partes.slice(4).join("/");
  resto = resto.replace(/^v\d+\//, "");
  const sinExtension = resto.replace(/\.(?:jpe?g|png|webp)$/i, "");
  if (!PUBLIC_ID_PROPIO.test(sinExtension)) {
    return null;
  }
  return sinExtension;
}

export async function borrarImagenPorPublicId(publicId: string): Promise<void> {
  if (!PUBLIC_ID_PROPIO.test(publicId)) return;
  configurar();
  await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
}

/**
 * Qué pasó al limpiar un prefijo. `"sin-cloudinary"` no es un fallo: en un
 * despliegue sin credenciales no existe ningún asset que borrar.
 */
export type ResultadoLimpieza = "limpiado" | "sin-cloudinary";

/**
 * Distingue "no hay Cloudinary" de "Cloudinary falló".
 *
 * Un error de red o un 5xx sí conviene propagarlo: quien llama aborta y
 * reintenta más tarde, antes de perder la fila que referencia los assets. Que
 * falten las credenciales, en cambio, no se arregla reintentando, y bloquear
 * por eso el borrado de un inmueble —o peor, el purgado de una cuenta— deja al
 * usuario sin poder borrar nada en un despliegue que la app soporta a
 * propósito (ver el comentario de `configurar`).
 */
async function limpiarPrefijo(prefijo: string): Promise<ResultadoLimpieza> {
  try {
    configurar();
  } catch (error) {
    if (error instanceof CloudinaryNoConfigurado) return "sin-cloudinary";
    throw error;
  }
  const resultado = await cloudinary.api.delete_resources_by_prefix(
    prefijo,
    OPCIONES_BORRADO,
  );
  if (resultado?.partial === true) {
    throw new Error(`Cloudinary no terminó de limpiar el prefijo ${prefijo}`);
  }
  return "limpiado";
}

export function borrarImagenesDeInmueble(
  usuarioId: string,
  inmuebleId: string,
): Promise<ResultadoLimpieza> {
  return limpiarPrefijo(`rentia/inmuebles/${usuarioId}/${inmuebleId}/`);
}

export function borrarImagenesDeUsuario(
  usuarioId: string,
): Promise<ResultadoLimpieza> {
  return limpiarPrefijo(`rentia/inmuebles/${usuarioId}/`);
}

export async function borrarImagen(url: string): Promise<void> {
  const publicId = publicIdDesdeUrl(url);
  if (!publicId) return;
  await borrarImagenPorPublicId(publicId);
}
