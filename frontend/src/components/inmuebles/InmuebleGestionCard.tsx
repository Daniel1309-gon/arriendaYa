import { useState } from "react";
import { Link } from "react-router-dom";
import {
  formatCOP,
  gradientePlaceholder,
  imagenThumb,
  numero,
  type Inmueble,
} from "../../lib/inmuebles";
import { Button } from "../ui/Button";

interface InmuebleGestionCardProps {
  inmueble: Inmueble;
  onEliminar: (inmueble: Inmueble) => void;
  eliminando?: boolean;
}

/**
 * Fila de "Mis inmuebles": mismo tratamiento visual de thumbnail que
 * InmuebleCard, pero con acciones (Ver/Editar/Eliminar) como hermanos en vez
 * de anidadas dentro de un <a> — un <button> dentro de un <a> es HTML
 * inválido y el navegador termina disparando el enlace exterior.
 */
export function InmuebleGestionCard({
  inmueble,
  onEliminar,
  eliminando = false,
}: InmuebleGestionCardProps) {
  const [rota, setRota] = useState(false);
  const portada = rota ? undefined : inmueble.imagenes?.[0];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col sm:flex-row">
      <Link
        to={`/inmuebles/${inmueble.id}`}
        className="block sm:w-48 shrink-0 aspect-4/3 sm:aspect-auto sm:h-auto bg-slate-100 overflow-hidden"
      >
        {portada ? (
          <img
            src={imagenThumb(portada, 300, 220)}
            alt=""
            loading="lazy"
            onError={() => setRota(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className={`w-full h-full min-h-30 bg-linear-to-br ${gradientePlaceholder(
              inmueble.id,
            )}`}
          />
        )}
      </Link>

      <div className="flex-1 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xl font-bold text-emerald-700">
              {formatCOP(numero(inmueble.valorCanon))}
            </span>
            {inmueble.estrato && (
              <span className="bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded text-xs font-medium">
                Estrato {inmueble.estrato}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {inmueble.habitaciones} hab · {inmueble.banos} baños ·{" "}
            {inmueble.tamanoM2} m²
          </p>
          {inmueble.imagenes?.length ? (
            <p className="text-xs text-slate-400 mt-1">
              {inmueble.imagenes.length} foto
              {inmueble.imagenes.length > 1 ? "s" : ""}
            </p>
          ) : (
            <p className="text-xs text-amber-600 mt-1">Sin fotos todavía</p>
          )}
        </div>

        <div className="flex gap-2 shrink-0">
          <Link to={`/inmuebles/${inmueble.id}`} className="no-underline">
            <Button type="button" variant="ghost" size="sm">
              Ver
            </Button>
          </Link>
          <Link to={`/inmuebles/${inmueble.id}/editar`} className="no-underline">
            <Button type="button" variant="secondary" size="sm">
              Editar
            </Button>
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onEliminar(inmueble)}
            disabled={eliminando}
            className="text-red-600 hover:bg-red-50"
          >
            Eliminar
          </Button>
        </div>
      </div>
    </div>
  );
}
