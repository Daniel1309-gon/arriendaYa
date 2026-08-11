import { useState } from "react";
import { Link } from "react-router-dom";
import {
  formatCOP,
  gradientePlaceholder,
  imagenThumb,
  numero,
  type Inmueble,
} from "../../lib/inmuebles";
import { useAuth } from "../../lib/auth-context";

interface InmuebleCardProps {
  inmueble: Inmueble;
  /** Las primeras cards son el LCP: se cargan de inmediato, el resto en lazy. */
  prioridad?: boolean;
}

function CasaIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-10 h-10"
      aria-hidden="true"
    >
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </svg>
  );
}

export function InmuebleCard({ inmueble, prioridad = false }: InmuebleCardProps) {
  const [rota, setRota] = useState(false);
  const { user } = useAuth();

  const canon = numero(inmueble.valorCanon);
  const esPropio = Boolean(user && inmueble.usuarioId === user.id);

  const fotos = inmueble.imagenes ?? [];
  const portada = rota ? undefined : fotos[0];
  const ubicacion = [inmueble.barrio, inmueble.ciudad].filter(Boolean).join(", ");

  const contenido = (
    <>
      <div className="aspect-4/3 overflow-hidden bg-slate-100 relative">
        {portada ? (
          <img
            src={imagenThumb(portada)}
            alt={
              ubicacion
                ? `Foto del inmueble en ${ubicacion}`
                : "Foto del inmueble"
            }
            width={384}
            height={275}
            loading={prioridad ? "eager" : "lazy"}
            fetchPriority={prioridad ? "high" : "auto"}
            decoding="async"
            // El portal podría cortar el hotlink si mira el Referer.
            referrerPolicy="no-referrer"
            onError={() => setRota(true)}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div
            className={`w-full h-full bg-linear-to-br ${gradientePlaceholder(
              inmueble.id,
            )} flex flex-col items-center justify-center gap-1 text-emerald-800/50`}
          >
            <CasaIcon />
            <span className="text-xs font-medium">Sin foto</span>
          </div>
        )}

        {inmueble.portalOrigen ? (
          <span className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm text-slate-700 px-2 py-1 rounded-full text-xs font-medium capitalize shadow-sm">
            {inmueble.portalOrigen}
          </span>
        ) : esPropio ? (
          <span className="absolute top-3 left-3 bg-emerald-700/90 backdrop-blur-sm text-white px-2 py-1 rounded-full text-xs font-medium shadow-sm">
            Tu inmueble
          </span>
        ) : null}
        {inmueble.activo === false && (
          <span className="absolute top-3 right-3 bg-slate-900/80 text-white px-2 py-1 rounded-full text-xs font-medium shadow-sm">
            Ya no disponible
          </span>
        )}
        {fotos.length > 1 && !rota && (
          <span className="absolute bottom-3 right-3 bg-slate-900/70 text-white px-2 py-0.5 rounded-full text-xs font-medium">
            {fotos.length} fotos
          </span>
        )}
      </div>

      <div className="p-6">
        <div className="flex items-baseline justify-between gap-2 mb-1">
          <span className="text-2xl font-bold text-emerald-700">
            {formatCOP(canon)}
          </span>
          {inmueble.estrato && (
            <span className="shrink-0 bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded text-xs font-medium">
              Estrato {inmueble.estrato}
            </span>
          )}
        </div>
        {ubicacion && (
          <p className="text-sm text-slate-600 font-medium mb-3 truncate">
            {ubicacion}
          </p>
        )}
        <div className="flex gap-4 text-sm text-slate-500 mb-3">
          <span>{inmueble.habitaciones} hab</span>
          <span>{inmueble.banos} baños</span>
          <span>{inmueble.tamanoM2} m²</span>
        </div>
        <div className="flex gap-2 flex-wrap text-xs">
          {inmueble.petFriendly && (
            <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
              Pet friendly
            </span>
          )}
          {inmueble.ascensor && (
            <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
              Ascensor
            </span>
          )}
          {inmueble.patio && (
            <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded-full">
              Patio
            </span>
          )}
        </div>
        {inmueble.administracionIncluida && (
          <p className="text-xs text-slate-400 mt-2">Administración incluida</p>
        )}
      </div>
    </>
  );

  const estilo =
    "group block bg-white rounded-2xl shadow-sm hover:shadow-md border border-slate-100 overflow-hidden transition-all no-underline text-inherit";

  return (
    <Link to={`/inmuebles/${inmueble.id}`} className={estilo}>
      {contenido}
    </Link>
  );
}
