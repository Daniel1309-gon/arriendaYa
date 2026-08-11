import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Navbar } from "../components/layout/Navbar";
import { Footer } from "../components/layout/Footer";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { InmuebleGestionCard } from "../components/inmuebles/InmuebleGestionCard";
import { RequireAuth } from "../lib/RequireAuth";
import { apiFetch } from "../lib/api";
import type { Inmueble } from "../lib/inmuebles";

function MisInmueblesPageContenido() {
  const [inmuebles, setInmuebles] = useState<Inmueble[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [porEliminar, setPorEliminar] = useState<Inmueble | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [errorBorrado, setErrorBorrado] = useState("");

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch<{ success: boolean; inmuebles: Inmueble[] }>(
        "/inmuebles/mios",
      );
      setInmuebles(res.inmuebles);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => cargar());
  }, [cargar]);

  const eliminar = async () => {
    if (!porEliminar) return;
    setBorrando(true);
    setErrorBorrado("");
    try {
      await apiFetch(`/inmuebles/${porEliminar.id}`, { method: "DELETE" });
      setInmuebles((actuales) => actuales.filter((i) => i.id !== porEliminar.id));
      setPorEliminar(null);
    } catch (err) {
      setErrorBorrado(err instanceof Error ? err.message : "No se pudo eliminar");
    } finally {
      setBorrando(false);
    }
  };

  return (
    <div className="bg-slate-50 font-sans text-slate-900 min-h-screen flex flex-col">
      <Navbar />
      <main className="grow pt-24 pb-16">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-4">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 mb-1">
                Mis inmuebles
              </h1>
              <p className="text-slate-500">
                {inmuebles.length} publicado{inmuebles.length !== 1 && "s"}
              </p>
            </div>
            <Link to="/inmuebles/nuevo" className="no-underline">
              <Button variant="primary" size="sm">
                + Publicar inmueble
              </Button>
            </Link>
          </div>

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
            <div className="text-center py-20 bg-white rounded-2xl border border-slate-100">
              <p className="text-lg font-semibold text-slate-900 mb-2">
                Aún no has publicado ningún inmueble
              </p>
              <p className="text-sm text-slate-500 mb-6">
                Publica tu primer inmueble para que otros usuarios lo encuentren.
              </p>
              <Link to="/inmuebles/nuevo" className="no-underline">
                <Button variant="primary" size="sm">
                  + Publicar inmueble
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {inmuebles.map((i) => (
                <InmuebleGestionCard
                  key={i.id}
                  inmueble={i}
                  onEliminar={setPorEliminar}
                  eliminando={borrando && porEliminar?.id === i.id}
                />
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />

      <ConfirmDialog
        open={porEliminar !== null}
        title="Eliminar inmueble"
        description="Esta acción no se puede deshacer. El anuncio dejará de ser visible de inmediato."
        confirmLabel="Eliminar"
        destructive
        loading={borrando}
        error={errorBorrado}
        onConfirm={eliminar}
        onCancel={() => {
          setPorEliminar(null);
          setErrorBorrado("");
        }}
      />
    </div>
  );
}

export default function MisInmueblesPage() {
  return (
    <RequireAuth>
      <MisInmueblesPageContenido />
    </RequireAuth>
  );
}
