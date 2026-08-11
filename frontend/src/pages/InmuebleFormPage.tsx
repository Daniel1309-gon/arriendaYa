import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Navbar } from "../components/layout/Navbar";
import { Footer } from "../components/layout/Footer";
import { Button } from "../components/ui/Button";
import { Select } from "../components/ui/Select";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { ImageUploader } from "../components/ui/ImageUploader";
import { RequireAuth } from "../lib/RequireAuth";
import { useAuth } from "../lib/auth-context";
import { apiFetch } from "../lib/api";
import { numero, type Inmueble } from "../lib/inmuebles";

const BOGOTA_CENTRO = { lat: "4.6097", lng: "-74.0817" };
const OPCIONES_ESTRATO = [1, 2, 3, 4, 5, 6].map((n) => ({
  value: String(n),
  label: `Estrato ${n}`,
}));

interface FormState {
  valorCanon: string;
  administracionIncluida: boolean;
  valorAdministracion: string;
  tamanoM2: string;
  habitaciones: string;
  banos: string;
  patio: boolean;
  parqueaderos: string;
  antiguedadAnos: string;
  estrato: string;
  piso: string;
  ascensor: boolean;
  petFriendly: boolean;
  latitud: string;
  longitud: string;
  url: string;
  descripcion: string;
}

const ESTADO_INICIAL: FormState = {
  valorCanon: "",
  administracionIncluida: false,
  valorAdministracion: "",
  tamanoM2: "",
  habitaciones: "1",
  banos: "1",
  patio: false,
  parqueaderos: "0",
  antiguedadAnos: "0",
  estrato: "3",
  piso: "1",
  ascensor: false,
  petFriendly: false,
  latitud: BOGOTA_CENTRO.lat,
  longitud: BOGOTA_CENTRO.lng,
  url: "",
  descripcion: "",
};

function inmuebleAForm(i: Inmueble): FormState {
  return {
    valorCanon: String(numero(i.valorCanon) || ""),
    administracionIncluida: Boolean(i.administracionIncluida),
    valorAdministracion:
      i.valorAdministracion != null ? String(numero(i.valorAdministracion)) : "",
    tamanoM2: String(i.tamanoM2 ?? ""),
    habitaciones: String(i.habitaciones ?? ""),
    banos: String(i.banos ?? ""),
    patio: Boolean(i.patio),
    parqueaderos: String(i.parqueaderos ?? 0),
    antiguedadAnos: String(i.antiguedadAnos ?? 0),
    estrato: String(i.estrato ?? 3),
    piso: String(i.piso ?? 0),
    ascensor: Boolean(i.ascensor),
    petFriendly: Boolean(i.petFriendly),
    latitud: i.latitud != null ? String(numero(i.latitud)) : BOGOTA_CENTRO.lat,
    longitud: i.longitud != null ? String(numero(i.longitud)) : BOGOTA_CENTRO.lng,
    url: i.url ?? "",
    descripcion: i.descripcion ?? "",
  };
}

/** Espejo de CreateInmuebleSchema en backend/src/modules/inmuebles/inmuebles.routes.ts. */
function formAPayload(f: FormState): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    valorCanon: Number(f.valorCanon),
    administracionIncluida: f.administracionIncluida,
    tamanoM2: Math.round(Number(f.tamanoM2)),
    habitaciones: Math.round(Number(f.habitaciones)),
    banos: Math.round(Number(f.banos)),
    patio: f.patio,
    parqueaderos: Math.round(Number(f.parqueaderos) || 0),
    antiguedadAnos: Math.round(Number(f.antiguedadAnos) || 0),
    estrato: Math.round(Number(f.estrato)),
    piso: Math.round(Number(f.piso)),
    ascensor: f.ascensor,
    petFriendly: f.petFriendly,
    latitud: Number(f.latitud),
    longitud: Number(f.longitud),
  };
  if (f.valorAdministracion.trim()) {
    payload.valorAdministracion = Number(f.valorAdministracion);
  }
  if (f.url.trim()) payload.url = f.url.trim();
  if (f.descripcion.trim()) payload.descripcion = f.descripcion.trim();
  return payload;
}

function validar(f: FormState): string | null {
  if (!f.valorCanon || Number(f.valorCanon) <= 0) {
    return "Ingresa un canon de arriendo válido";
  }
  if (!f.tamanoM2 || Number(f.tamanoM2) <= 0) return "Ingresa un área válida";
  if (f.habitaciones === "" || Number(f.habitaciones) < 0) {
    return "Ingresa el número de habitaciones";
  }
  if (f.banos === "" || Number(f.banos) < 0) return "Ingresa el número de baños";
  const estrato = Number(f.estrato);
  if (!estrato || estrato < 1 || estrato > 6) return "El estrato debe estar entre 1 y 6";
  if (f.piso === "" || Number.isNaN(Number(f.piso))) return "Ingresa el piso";
  if (
    !f.latitud ||
    !f.longitud ||
    Number.isNaN(Number(f.latitud)) ||
    Number.isNaN(Number(f.longitud))
  ) {
    return "Ingresa una ubicación válida";
  }
  return null;
}

const fieldClass =
  "w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 outline-none transition-all bg-white text-slate-900 disabled:bg-slate-50 disabled:text-slate-500";
const labelClass =
  "block text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2";
const checkboxRowClass = "flex items-center gap-2 cursor-pointer";
const checkboxClass =
  "w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer";

function InmuebleFormPageContenido() {
  const { id } = useParams<{ id: string }>();
  const editando = Boolean(id);
  const navigate = useNavigate();
  const { user } = useAuth();

  const [form, setForm] = useState<FormState>(ESTADO_INICIAL);
  const [imagenes, setImagenes] = useState<string[]>([]);
  const [cargando, setCargando] = useState(editando);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [sinPermiso, setSinPermiso] = useState(false);
  const [mensajeExito, setMensajeExito] = useState("");

  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [errorBorrado, setErrorBorrado] = useState("");

  useEffect(() => {
    if (!editando || !id) return;
    let cancelado = false;

    const cargar = async () => {
      await Promise.resolve();
      if (cancelado) return;

      setCargando(true);
      try {
        const res = await apiFetch<{ success: boolean; inmueble: Inmueble }>(
          `/inmuebles/${id}`,
        );
        if (cancelado) return;
        // Sólo se puede editar un inmueble propio; uno scrapeado no trae
        // usuarioId. La verificación real vive en el servidor (PUT/DELETE
        // devuelven 403) — esto es sólo para no mostrar un formulario que de
        // todas formas no se va a poder guardar.
        if (!res.inmueble.usuarioId || res.inmueble.usuarioId !== user?.id) {
          setSinPermiso(true);
          return;
        }
        setForm(inmuebleAForm(res.inmueble));
        setImagenes(res.inmueble.imagenes ?? []);
      } catch (err) {
        if (!cancelado) {
          setError(err instanceof Error ? err.message : "Error al cargar");
        }
      } finally {
        if (!cancelado) setCargando(false);
      }
    };

    void cargar();
    return () => {
      cancelado = true;
    };
  }, [editando, id, user]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const problema = validar(form);
    if (problema) {
      setError(problema);
      return;
    }
    setError("");
    setGuardando(true);
    try {
      const payload = formAPayload(form);
      if (editando && id) {
        await apiFetch(`/inmuebles/${id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setMensajeExito("Cambios guardados.");
      } else {
        const res = await apiFetch<{ success: boolean; inmueble: Inmueble }>(
          "/inmuebles",
          { method: "POST", body: JSON.stringify(payload) },
        );
        setMensajeExito("Inmueble creado. Ahora puedes agregarle fotos.");
        // No remonta: mismo componente, sólo cambia el param de la ruta. El
        // efecto de arriba se vuelve a disparar porque `id`/`editando`
        // cambiaron, y trae el inmueble recién creado con imagenes: [].
        navigate(`/inmuebles/${res.inmueble.id}/editar`, { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async () => {
    if (!id) return;
    setBorrando(true);
    setErrorBorrado("");
    try {
      await apiFetch(`/inmuebles/${id}`, { method: "DELETE" });
      navigate("/mis-inmuebles", { replace: true });
    } catch (err) {
      setErrorBorrado(err instanceof Error ? err.message : "No se pudo eliminar");
      setBorrando(false);
    }
  };

  const contenedor =
    "bg-slate-50 font-sans text-slate-900 min-h-screen flex flex-col";

  if (cargando) {
    return (
      <div className={contenedor}>
        <Navbar />
        <main className="grow pt-24 pb-16 flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-3 border-emerald-700 border-t-transparent rounded-full" />
        </main>
        <Footer />
      </div>
    );
  }

  if (sinPermiso) {
    return (
      <div className={contenedor}>
        <Navbar />
        <main className="grow pt-24 pb-16 flex items-center justify-center">
          <div className="text-center px-4">
            <p className="text-lg font-semibold text-slate-900 mb-2">
              No puedes editar este inmueble
            </p>
            <p className="text-sm text-slate-500 mb-6">
              Sólo el dueño de la publicación puede modificarla.
            </p>
            <Link to="/mis-inmuebles" className="no-underline">
              <Button variant="primary" size="sm">
                Ir a mis inmuebles
              </Button>
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className={contenedor}>
      <Navbar />
      <main className="grow pt-24 pb-16">
        <div className="max-w-3xl mx-auto px-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 md:p-10">
            <div className="flex items-center justify-between mb-8">
              <h1 className="text-2xl font-bold text-slate-900">
                {editando ? "Editar inmueble" : "Publicar inmueble"}
              </h1>
              <Link
                to="/mis-inmuebles"
                className="text-sm font-medium text-slate-500 hover:text-emerald-700 no-underline"
              >
                Mis inmuebles
              </Link>
            </div>

            {mensajeExito && (
              <div
                role="status"
                className="mb-6 p-3 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm"
              >
                {mensajeExito}
              </div>
            )}
            {error && (
              <div
                role="alert"
                className="mb-6 p-3 rounded-lg bg-red-50 border border-red-100 text-red-700 text-sm"
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-8">
              <section className="space-y-4">
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Precio
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Canon mensual (COP)</label>
                    <input
                      type="number"
                      min={1}
                      value={form.valorCanon}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, valorCanon: e.target.value }))
                      }
                      placeholder="2000000"
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>
                      Valor administración (opcional)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={form.valorAdministracion}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          valorAdministracion: e.target.value,
                        }))
                      }
                      disabled={form.administracionIncluida}
                      placeholder="150000"
                      className={fieldClass}
                    />
                  </div>
                </div>
                <label className={checkboxRowClass}>
                  <input
                    type="checkbox"
                    checked={form.administracionIncluida}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        administracionIncluida: e.target.checked,
                      }))
                    }
                    className={checkboxClass}
                  />
                  <span className="text-sm text-slate-700">
                    El canon ya incluye la administración
                  </span>
                </label>
              </section>

              <section className="space-y-4">
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Características
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div>
                    <label className={labelClass}>Área (m²)</label>
                    <input
                      type="number"
                      min={1}
                      value={form.tamanoM2}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, tamanoM2: e.target.value }))
                      }
                      placeholder="45"
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Habitaciones</label>
                    <input
                      type="number"
                      min={0}
                      value={form.habitaciones}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, habitaciones: e.target.value }))
                      }
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Baños</label>
                    <input
                      type="number"
                      min={0}
                      value={form.banos}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, banos: e.target.value }))
                      }
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Parqueaderos</label>
                    <input
                      type="number"
                      min={0}
                      value={form.parqueaderos}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, parqueaderos: e.target.value }))
                      }
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Piso</label>
                    <input
                      type="number"
                      value={form.piso}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, piso: e.target.value }))
                      }
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Antigüedad (años)</label>
                    <input
                      type="number"
                      min={0}
                      value={form.antiguedadAnos}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, antiguedadAnos: e.target.value }))
                      }
                      className={fieldClass}
                    />
                  </div>
                </div>
                <div className="max-w-48">
                  <label className={labelClass}>Estrato</label>
                  <div className={`${fieldClass} py-2.5`}>
                    <Select
                      value={form.estrato}
                      onChange={(v) => setForm((f) => ({ ...f, estrato: v }))}
                      options={OPCIONES_ESTRATO}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-5 pt-1">
                  <label className={checkboxRowClass}>
                    <input
                      type="checkbox"
                      checked={form.ascensor}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, ascensor: e.target.checked }))
                      }
                      className={checkboxClass}
                    />
                    <span className="text-sm text-slate-700">Ascensor</span>
                  </label>
                  <label className={checkboxRowClass}>
                    <input
                      type="checkbox"
                      checked={form.patio}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, patio: e.target.checked }))
                      }
                      className={checkboxClass}
                    />
                    <span className="text-sm text-slate-700">Patio</span>
                  </label>
                  <label className={checkboxRowClass}>
                    <input
                      type="checkbox"
                      checked={form.petFriendly}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, petFriendly: e.target.checked }))
                      }
                      className={checkboxClass}
                    />
                    <span className="text-sm text-slate-700">Pet friendly</span>
                  </label>
                </div>
              </section>

              <section className="space-y-4">
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Ubicación
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Latitud</label>
                    <input
                      type="number"
                      step="any"
                      value={form.latitud}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, latitud: e.target.value }))
                      }
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Longitud</label>
                    <input
                      type="number"
                      step="any"
                      value={form.longitud}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, longitud: e.target.value }))
                      }
                      className={fieldClass}
                    />
                  </div>
                </div>
                <p className="text-xs text-slate-400">
                  Vienen prellenadas con el centro de Bogotá. Ajústalas si
                  conoces la ubicación exacta (puedes tomarlas de Google
                  Maps: clic derecho sobre el punto → copiar coordenadas).
                </p>
              </section>

              <section className="space-y-4">
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Detalles
                </h2>
                <div>
                  <label className={labelClass}>
                    Enlace externo (opcional)
                  </label>
                  <input
                    type="text"
                    value={form.url}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, url: e.target.value }))
                    }
                    placeholder="https://..."
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Descripción</label>
                  <textarea
                    value={form.descripcion}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, descripcion: e.target.value }))
                    }
                    maxLength={2000}
                    rows={5}
                    placeholder="Cuéntale a los interesados sobre el inmueble..."
                    className={`${fieldClass} resize-y`}
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    {form.descripcion.length}/2000
                  </p>
                </div>
              </section>

              <div className="flex gap-3 pt-2">
                <Button type="submit" variant="primary" disabled={guardando}>
                  {guardando
                    ? "Guardando..."
                    : editando
                      ? "Guardar cambios"
                      : "Publicar inmueble"}
                </Button>
                <Link to="/mis-inmuebles" className="no-underline">
                  <Button type="button" variant="ghost" disabled={guardando}>
                    Cancelar
                  </Button>
                </Link>
              </div>
            </form>
          </div>

          {editando && id && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 md:p-10 mt-8">
              <ImageUploader
                inmuebleId={id}
                imagenes={imagenes}
                onChange={setImagenes}
              />
            </div>
          )}

          {editando && (
            <div className="bg-white border border-red-200 rounded-2xl p-6 md:p-8 shadow-sm mt-8">
              <h3 className="text-lg font-bold text-slate-900 mb-1">
                Eliminar inmueble
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed mb-4">
                El anuncio dejará de ser visible de inmediato y no se puede
                deshacer.
              </p>
              <Button
                variant="secondary"
                onClick={() => setConfirmandoBorrado(true)}
                className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
              >
                Eliminar inmueble
              </Button>
            </div>
          )}
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

export default function InmuebleFormPage() {
  return (
    <RequireAuth>
      <InmuebleFormPageContenido />
    </RequireAuth>
  );
}
