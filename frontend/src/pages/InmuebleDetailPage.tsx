import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Navbar } from "../components/layout/Navbar";
import { Footer } from "../components/layout/Footer";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { useAuth } from "../lib/auth-context";
import { apiFetch } from "../lib/api";
import {
  formatCOP,
  gradientePlaceholder,
  imagenThumb,
  numero,
  urlHttpSegura,
  type Inmueble,
} from "../lib/inmuebles";

// El CDN del portal (cdn2.infocasas.com.uy) sólo tiene pre-generados un puñado
// de tamaños "th.outside{W}x{H}". 800x600 responde en ~500ms porque está
// cacheado; medido en producción, 1200x800 no lo está y lo genera al vuelo en
// cada request (~2.2s). Si el portal cambia sus buckets, volver a medir antes
// de tocar esto — no hay forma de saberlo sin probar contra el CDN real.
const GALERIA_ANCHO = 800;
const GALERIA_ALTO = 600;

function CasaIcon({ className = "w-16 h-16" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </svg>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-slate-50 rounded-xl px-4 py-3">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className="text-lg font-bold text-slate-900">{value}</p>
    </div>
  );
}

export default function InmuebleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [inmueble, setInmueble] = useState<Inmueble | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);

  const [indiceFoto, setIndiceFoto] = useState(0);
  const [fotoRota, setFotoRota] = useState(false);
  const [fotoCargando, setFotoCargando] = useState(false);

  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [errorBorrado, setErrorBorrado] = useState("");

  useEffect(() => {
    if (!id) return;
    let cancelado = false;

    const cargar = async () => {
      await Promise.resolve();
      if (cancelado) return;

      setLoading(true);
      setError("");
      setNotFound(false);
      setIndiceFoto(0);
      setFotoRota(false);
      setFotoCargando(false);

      try {
        const res = await apiFetch<{ success: boolean; inmueble: Inmueble }>(
          `/inmuebles/${id}`,
        );
        if (!cancelado) setInmueble(res.inmueble);
      } catch (err) {
        if (cancelado) return;
        if (err instanceof Error && /no encontrado/i.test(err.message)) {
          setNotFound(true);
        } else {
          setError(err instanceof Error ? err.message : "Error al cargar");
        }
      } finally {
        if (!cancelado) setLoading(false);
      }
    };

    void cargar();

    return () => {
      cancelado = true;
    };
  }, [id]);

  // Precarga el resto de la galería en segundo plano: sin esto, cada clic en
  // una miniatura dispara un fetch nuevo al CDN del portal (hasta ~2.2s, ver
  // nota en GALERIA_ANCHO), porque el navegador no tenía esa foto en caché.
  // fetchPriority "low" evita que compita con la imagen principal que sí es
  // visible de inmediato.
  useEffect(() => {
    const fotos = inmueble?.imagenes ?? [];
    if (fotos.length < 2) return;
    const precargas = fotos.map((url) => {
      const img = new Image();
      img.referrerPolicy = "no-referrer";
      img.fetchPriority = "low";
      img.src = imagenThumb(url, GALERIA_ANCHO, GALERIA_ALTO);
      return img;
    });
    return () => {
      // Corta las descargas en vuelo si el usuario ya se fue del inmueble.
      precargas.forEach((img) => {
        img.src = "";
      });
    };
  }, [inmueble]);

  // Registra la vista en el historial del usuario. No debe bloquear ni
  // interrumpir la carga de la página si falla, y sólo una vez por inmueble
  // cargado (un ref evita el doble disparo de StrictMode en dev).
  const registrada = useRef<string | null>(null);
  useEffect(() => {
    if (!inmueble || !user) return;
    if (registrada.current === inmueble.id) return;
    registrada.current = inmueble.id;
    apiFetch("/usuarios/historial", {
      method: "POST",
      body: JSON.stringify({ inmuebleId: inmueble.id }),
    }).catch(() => {
      // Ver el inmueble no debe fallar porque el historial no se pudo guardar.
    });
  }, [inmueble, user]);

  const eliminar = async () => {
    if (!inmueble) return;
    setBorrando(true);
    setErrorBorrado("");
    try {
      await apiFetch(`/inmuebles/${inmueble.id}`, { method: "DELETE" });
      navigate("/mis-inmuebles", { replace: true });
    } catch (err) {
      setErrorBorrado(
        err instanceof Error ? err.message : "No se pudo eliminar",
      );
      setBorrando(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-slate-50 font-sans text-slate-900 min-h-screen flex flex-col">
        <Navbar />
        <main className="grow pt-24 pb-16 flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-3 border-emerald-700 border-t-transparent rounded-full" />
        </main>
        <Footer />
      </div>
    );
  }

  if (notFound || (!inmueble && !error)) {
    return (
      <div className="bg-slate-50 font-sans text-slate-900 min-h-screen flex flex-col">
        <Navbar />
        <main className="grow pt-24 pb-16 flex items-center justify-center">
          <div className="text-center px-4">
            <p className="text-lg font-semibold text-slate-900 mb-2">
              Inmueble no encontrado
            </p>
            <p className="text-sm text-slate-500 mb-6">
              Puede que el anuncio ya no exista o haya sido eliminado.
            </p>
            <Link to="/inmuebles" className="no-underline">
              <Button variant="primary" size="sm">
                Ver otros inmuebles
              </Button>
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (error || !inmueble) {
    return (
      <div className="bg-slate-50 font-sans text-slate-900 min-h-screen flex flex-col">
        <Navbar />
        <main className="grow pt-24 pb-16 max-w-2xl mx-auto px-4">
          <div
            role="alert"
            className="p-4 rounded-xl bg-red-50 border border-red-100 text-red-700"
          >
            {error}
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const fotos = inmueble.imagenes ?? [];
  const fotoActual = fotoRota ? undefined : fotos[indiceFoto];
  const urlOriginalSegura = urlHttpSegura(inmueble.urlOriginal);
  const urlSegura = urlHttpSegura(inmueble.url);
  const ubicacion = [inmueble.barrio, inmueble.ciudad].filter(Boolean).join(", ");
  const esPropio = Boolean(user && inmueble.usuarioId === user.id);
  const valorAdmin = numero(inmueble.valorAdministracion);
  const lat = numero(inmueble.latitud);
  const lng = numero(inmueble.longitud);
  const tieneMapa = lat !== 0 && lng !== 0;

  return (
    <div className="bg-slate-50 font-sans text-slate-900 min-h-screen flex flex-col">
      <Navbar />
      <main className="grow pt-24 pb-16">
        <div className="max-w-5xl mx-auto px-4 md:px-8">
          <Link
            to="/inmuebles"
            className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-emerald-700 no-underline mb-6"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
            Volver a inmuebles
          </Link>

          {inmueble.activo === false && (
            <div className="mb-6 p-4 rounded-xl bg-slate-900 text-white text-sm">
              Este anuncio ya no está disponible en el portal de origen. La
              información puede estar desactualizada.
            </div>
          )}

          {/* Galería */}
          <div className="mb-8">
            <div className="aspect-16/10 md:aspect-21/9 rounded-2xl overflow-hidden bg-slate-100 relative">
              {fotoActual ? (
                <>
                  <img
                    // Deliberadamente sin key: mantener el mismo nodo <img>
                    // hace que el navegador siga mostrando la foto anterior
                    // (en vez de un hueco en blanco) mientras la nueva carga
                    // detrás del spinner.
                    src={imagenThumb(fotoActual, GALERIA_ANCHO, GALERIA_ALTO)}
                    alt={ubicacion ? `Foto del inmueble en ${ubicacion}` : "Foto del inmueble"}
                    referrerPolicy="no-referrer"
                    fetchPriority="high"
                    decoding="async"
                    onLoad={() => setFotoCargando(false)}
                    onError={() => {
                      setFotoCargando(false);
                      setFotoRota(true);
                    }}
                    className="w-full h-full object-cover"
                  />
                  {fotoCargando && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-100/60">
                      <div className="animate-spin w-6 h-6 border-3 border-emerald-700 border-t-transparent rounded-full" />
                    </div>
                  )}
                </>
              ) : (
                <div
                  className={`w-full h-full bg-linear-to-br ${gradientePlaceholder(
                    inmueble.id,
                  )} flex flex-col items-center justify-center gap-2 text-emerald-800/50`}
                >
                  <CasaIcon />
                  <span className="text-sm font-medium">Sin fotos</span>
                </div>
              )}
            </div>
            {fotos.length > 1 && (
              <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
                {fotos.map((url, i) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => {
                      if (i === indiceFoto) return;
                      setIndiceFoto(i);
                      setFotoRota(false);
                      setFotoCargando(true);
                    }}
                    className={`shrink-0 w-20 h-16 rounded-lg overflow-hidden border-2 p-0 cursor-pointer ${
                      i === indiceFoto
                        ? "border-emerald-600"
                        : "border-transparent opacity-70 hover:opacity-100"
                    }`}
                  >
                    <img
                      src={imagenThumb(url, 120, 90)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <div className="flex items-start justify-between gap-4 mb-2">
                <span className="text-3xl font-bold text-emerald-700">
                  {formatCOP(numero(inmueble.valorCanon))}
                </span>
                {inmueble.portalOrigen && (
                  <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-xs font-medium capitalize shrink-0">
                    {inmueble.portalOrigen}
                  </span>
                )}
              </div>

              {ubicacion && (
                <p className="text-slate-600 font-medium mb-1 flex items-center gap-1">
                  <svg className="w-4 h-4 text-emerald-700 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.243-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {ubicacion}
                </p>
              )}
              {tieneMapa && (
                <a
                  href={`https://www.google.com/maps?q=${lat},${lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-emerald-700 hover:underline"
                >
                  Ver en el mapa ↗
                </a>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 my-6">
                <Stat label="Habitaciones" value={inmueble.habitaciones} />
                <Stat label="Baños" value={inmueble.banos} />
                <Stat label="Área" value={`${inmueble.tamanoM2} m²`} />
                {inmueble.parqueaderos !== undefined && (
                  <Stat label="Parqueaderos" value={inmueble.parqueaderos} />
                )}
                {inmueble.piso !== undefined && (
                  <Stat label="Piso" value={inmueble.piso} />
                )}
                {inmueble.antiguedadAnos !== undefined && (
                  <Stat label="Antigüedad" value={`${inmueble.antiguedadAnos} años`} />
                )}
                {inmueble.estrato && <Stat label="Estrato" value={inmueble.estrato} />}
              </div>

              <div className="flex gap-2 flex-wrap mb-6">
                {inmueble.petFriendly && (
                  <span className="bg-amber-50 text-amber-700 px-3 py-1 rounded-full text-sm font-medium">
                    Pet friendly
                  </span>
                )}
                {inmueble.ascensor && (
                  <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm font-medium">
                    Ascensor
                  </span>
                )}
                {inmueble.patio && (
                  <span className="bg-green-50 text-green-700 px-3 py-1 rounded-full text-sm font-medium">
                    Patio
                  </span>
                )}
                {inmueble.administracionIncluida ? (
                  <span className="bg-emerald-50 text-emerald-800 px-3 py-1 rounded-full text-sm font-medium">
                    Administración incluida
                  </span>
                ) : valorAdmin > 0 ? (
                  <span className="bg-slate-100 text-slate-700 px-3 py-1 rounded-full text-sm font-medium">
                    Administración: {formatCOP(valorAdmin)}
                  </span>
                ) : null}
              </div>

              {inmueble.descripcion && (
                <div className="mb-6">
                  <h2 className="text-lg font-bold text-slate-900 mb-2">Descripción</h2>
                  <p className="text-slate-600 leading-relaxed whitespace-pre-line">
                    {inmueble.descripcion}
                  </p>
                </div>
              )}
            </div>

            {/* Panel lateral: acciones */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-3 sticky top-24">
                {urlOriginalSegura && (
                  <a
                    href={urlOriginalSegura}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="no-underline block"
                  >
                    <Button variant="primary" fullWidth>
                      Ver anuncio original ↗
                    </Button>
                  </a>
                )}
                {urlSegura && !urlOriginalSegura && (
                  <a href={urlSegura} target="_blank" rel="noopener noreferrer" className="no-underline block">
                    <Button variant="primary" fullWidth>
                      Ver enlace ↗
                    </Button>
                  </a>
                )}

                {esPropio && (
                  <>
                    <Link to={`/inmuebles/${inmueble.id}/editar`} className="no-underline block">
                      <Button variant="secondary" fullWidth>
                        Editar inmueble
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      fullWidth
                      onClick={() => setConfirmandoBorrado(true)}
                      className="text-red-600 hover:bg-red-50"
                    >
                      Eliminar inmueble
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />

      <ConfirmDialog
        open={confirmandoBorrado}
        title="Eliminar inmueble"
        description="Esta acción no se puede deshacer. El anuncio dejará de ser visible de inmediato."
        confirmLabel="Eliminar"
        destructive
        loading={borrando}
        error={errorBorrado}
        onConfirm={eliminar}
        onCancel={() => {
          setConfirmandoBorrado(false);
          setErrorBorrado("");
        }}
      />
    </div>
  );
}
