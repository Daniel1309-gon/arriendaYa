import { useCallback, useEffect, useState } from "react";
import { Navbar } from "../components/layout/Navbar";
import { Footer } from "../components/layout/Footer";
import { Button } from "../components/ui/Button";
import { apiFetch } from "../lib/api";
import type { Inmueble } from "../lib/inmuebles";
import { InmuebleCard } from "../components/inmuebles/InmuebleCard";

/** Cards de la primera fila en desktop: se cargan sin lazy porque son el LCP. */
const CARDS_PRIORITARIAS = 3;

export default function InmueblesListadoPage() {
  const [inmuebles, setInmuebles] = useState<Inmueble[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [filtros, setFiltros] = useState({
    precioMin: "",
    precioMax: "",
    habitaciones: "",
    estrato: "",
  });

  const buscar = useCallback(async (params?: Record<string, string>) => {
    setLoading(true);
    setError("");
    try {
      const qs = params
        ? "?" + new URLSearchParams(params).toString()
        : "";
      const res = await apiFetch<{ success: boolean; inmuebles: Inmueble[] }>(
        `/inmuebles${qs}`,
      );
      setInmuebles(res.inmuebles);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => buscar());
  }, [buscar]);

  const handleFilter = (e: React.FormEvent) => {
    e.preventDefault();
    const params: Record<string, string> = {};
    if (filtros.precioMin) params.precioMin = filtros.precioMin;
    if (filtros.precioMax) params.precioMax = filtros.precioMax;
    if (filtros.habitaciones) params.habitaciones = filtros.habitaciones;
    if (filtros.estrato) params.estrato = filtros.estrato;
    buscar(params);
  };

  const clearFilters = () => {
    setFiltros({ precioMin: "", precioMax: "", habitaciones: "", estrato: "" });
    buscar();
  };

  return (
    <div className="bg-slate-50 font-sans text-slate-900 min-h-screen flex flex-col">
      <Navbar />
      <main className="grow pt-24 pb-16">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 mb-1">
                Inmuebles disponibles
              </h1>
              <p className="text-slate-500">
                {inmuebles.length} resultado{inmuebles.length !== 1 && "s"}{" "}
                en Bogotá
              </p>
            </div>
          </div>

          {/* Filters */}
          <form
            onSubmit={handleFilter}
            className="bg-white rounded-xl p-4 md:p-6 mb-8 shadow-sm border border-slate-100 flex flex-wrap gap-4 items-end"
          >
            <div className="flex-1 min-w-35">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                Precio mín
              </label>
              <input
                type="number"
                value={filtros.precioMin}
                onChange={(e) =>
                  setFiltros((f) => ({ ...f, precioMin: e.target.value }))
                }
                placeholder="$800,000"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400 outline-none text-sm"
              />
            </div>
            <div className="flex-1 min-w-35">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                Precio máx
              </label>
              <input
                type="number"
                value={filtros.precioMax}
                onChange={(e) =>
                  setFiltros((f) => ({ ...f, precioMax: e.target.value }))
                }
                placeholder="$3,000,000"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400 outline-none text-sm"
              />
            </div>
            <div className="flex-1 min-w-30">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                Habitaciones
              </label>
              <input
                type="number"
                value={filtros.habitaciones}
                onChange={(e) =>
                  setFiltros((f) => ({
                    ...f,
                    habitaciones: e.target.value,
                  }))
                }
                placeholder="2"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400 outline-none text-sm"
              />
            </div>
            <div className="flex-1 min-w-25">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                Estrato
              </label>
              <input
                type="number"
                min={1}
                max={6}
                value={filtros.estrato}
                onChange={(e) =>
                  setFiltros((f) => ({ ...f, estrato: e.target.value }))
                }
                placeholder="4"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400 outline-none text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="primary" size="sm">
                Filtrar
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearFilters}
              >
                Limpiar
              </Button>
            </div>
          </form>

          {/* Results */}
          {error && (
            <div
              role="alert"
              className="mb-6 p-4 rounded-xl bg-red-50 border border-red-100 text-red-700"
            >
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin w-8 h-8 border-3 border-emerald-700 border-t-transparent rounded-full" />
            </div>
          ) : inmuebles.length === 0 ? (
            <div className="text-center py-20 text-slate-500">
              <p className="text-lg font-semibold mb-2">
                No se encontraron inmuebles
              </p>
              <p className="text-sm">
                Intenta con otros filtros o limpia la búsqueda
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {inmuebles.map((i, indice) => (
                <InmuebleCard
                  key={i.id}
                  inmueble={i}
                  prioridad={indice < CARDS_PRIORITARIAS}
                />
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
