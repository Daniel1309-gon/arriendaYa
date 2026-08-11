export interface Inmueble {
  id: string;
  /** Sólo presente en inmuebles propios (Postgres); ausente en scrapeados. */
  usuarioId?: string;
  valorCanon: number | string;
  administracionIncluida?: boolean;
  valorAdministracion?: number | string;
  tamanoM2: number;
  habitaciones: number;
  banos: number;
  patio?: boolean;
  parqueaderos?: number;
  antiguedadAnos?: number;
  estrato?: number;
  piso?: number;
  ascensor?: boolean;
  petFriendly?: boolean;
  latitud?: number | string;
  longitud?: number | string;
  url?: string;
  descripcion?: string;
  imagenes?: string[];
  barrio?: string;
  ciudad?: string;
  portalOrigen?: string;
  urlOriginal?: string;
  fechaScraping?: string;
  /** Sólo presente en scrapeados; false cuando el scraper dejó de verlo publicado. */
  activo?: boolean;
}

const formateadorCOP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

/** Formatea un valor en pesos colombianos, p.ej. "$2.300.000". */
export function formatCOP(valor: number | string): string {
  return formateadorCOP.format(numero(valor));
}

/**
 * Los campos Decimal de Prisma (valorCanon, valorAdministracion, latitud,
 * longitud) llegan del backend como string, no como number, así que cada
 * consumidor tendría que repetir esta coerción. `Number("")` da 0, que es
 * razonable para los opcionales (valorAdministracion sin definir).
 */
export function numero(valor: number | string | undefined | null): number {
  if (valor === undefined || valor === null) return 0;
  return typeof valor === "string" ? Number(valor) : valor;
}

export function urlHttpSegura(
  url: string | null | undefined,
): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? url
      : undefined;
  } catch {
    return undefined;
  }
}

const HOST_CLOUDINARY = "res.cloudinary.com";
const HOST_CLOUDFRONT = "d3s5pkt10pk3ga.cloudfront.net";

function esHostPortal(host: string): boolean {
  return (
    host === "infocasas.com.uy" ||
    host.endsWith(".infocasas.com.uy") ||
    host === "fincaraiz.com.co" ||
    host.endsWith(".fincaraiz.com.co")
  );
}

function parsearUrlImagen(url: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.port ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    return null;
  }

  const partes = parsed.pathname.split("/");
  const esFormatoRaster = /\.(?:jpe?g|png|webp)$/i.test(parsed.pathname);
  const esCloudinary =
    parsed.hostname === HOST_CLOUDINARY &&
    partes[1] &&
    partes[2] === "image" &&
    partes[3] === "upload" &&
    partes.length > 4 &&
    esFormatoRaster;
  const esPortal =
    (esHostPortal(parsed.hostname) || parsed.hostname === HOST_CLOUDFRONT) &&
    parsed.pathname.startsWith("/repo/img/") &&
    parsed.pathname.length > "/repo/img/".length &&
    esFormatoRaster;

  return esCloudinary || esPortal ? parsed : null;
}

/**
 * Devuelve una variante liviana de la imagen para la cuadrícula.
 *
 * Guardamos la resolución original para que un futuro detalle o lightbox pueda
 * pedir la grande sin volver a scrapear, pero servirla en las cards costaría
 * ~420 KB por foto. Los dos CDN aceptan redimensionar por URL:
 *
 * - Portal: se inserta `th.outside{W}x{H}.` antes del nombre del archivo
 *   (la de 384x275 pesa ~18 KB, 23 veces menos que la original).
 * - Cloudinary: se inserta `f_auto,q_auto,c_limit,w_{W}` como transformación.
 *
 * Una URL que no pertenezca a un origen HTTPS permitido se reemplaza por
 * `about:blank`; nunca se entrega directamente al atributo `src`.
 */
export function imagenThumb(url: string, ancho = 384, alto = 275): string {
  const parsed = parsearUrlImagen(url);
  if (!parsed) return "about:blank";

  const partes = parsed.pathname.split("/");
  if (
    parsed.hostname === HOST_CLOUDINARY &&
    partes[2] === "image" &&
    partes[3] === "upload"
  ) {
    parsed.pathname = `/${partes[1]}/image/upload/f_auto,q_auto,c_limit,w_${ancho},h_${alto}/${partes
      .slice(4)
      .join("/")}`;
    return parsed.toString();
  }

  const ultimaBarra = parsed.pathname.lastIndexOf("/");
  const archivo = parsed.pathname.slice(ultimaBarra + 1);
  if (!archivo || archivo.startsWith("th.")) return parsed.toString();
  parsed.pathname = `${parsed.pathname.slice(0, ultimaBarra + 1)}th.outside${ancho}x${alto}.${archivo}`;
  return parsed.toString();
}

const GRADIENTES = [
  "from-emerald-100 to-teal-200",
  "from-teal-100 to-emerald-200",
  "from-slate-100 to-emerald-100",
  "from-emerald-50 to-green-200",
  "from-cyan-100 to-emerald-200",
];

/**
 * Gradiente estable para el placeholder de un inmueble sin foto.
 *
 * Depende sólo del id, así que la card no cambia de color entre renders ni
 * entre búsquedas, y la cuadrícula sin fotos no queda toda del mismo tono.
 */
export function gradientePlaceholder(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return GRADIENTES[Math.abs(hash) % GRADIENTES.length];
}
