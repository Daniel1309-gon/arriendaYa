import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "../components/layout/Navbar";
import { Footer } from "../components/layout/Footer";
import { Button } from "../components/ui/Button";
import { RequireAuth } from "../lib/RequireAuth";
import { useAuth, type User } from "../lib/auth-context";
import { apiFetch, auth } from "../lib/api";
import { DeleteAccountSection } from "../components/profile/DeleteAccountSection";

function formularioDeUsuario(user: User) {
  return {
    telefono: user.telefono ?? "",
    edad: user.edad ?? "",
    ciudadOrigen: user.ciudadOrigen ?? "",
    presupuestoMin: user.presupuestoMin ?? "",
    presupuestoMax: user.presupuestoMax ?? "",
    zonasInteres: user.zonasInteres?.join(", ") ?? "",
  };
}

function PerfilPageContenido({ user }: { user: User }) {
  const { refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [form, setForm] = useState(() => formularioDeUsuario(user));

  const handleAccountDeleted = (eliminacionProgramadaEn: string) => {
    auth.clearToken();
    logout();
    navigate(
      `/login?deleted=1&until=${encodeURIComponent(eliminacionProgramadaEn)}`,
      { replace: true },
    );
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);

    const payload: Record<string, unknown> = {};
    if (form.telefono) payload.telefono = form.telefono;
    if (form.edad) payload.edad = Number(form.edad);
    if (form.ciudadOrigen) payload.ciudadOrigen = form.ciudadOrigen;
    if (form.presupuestoMin) payload.presupuestoMin = Number(form.presupuestoMin);
    if (form.presupuestoMax) payload.presupuestoMax = Number(form.presupuestoMax);
    if (form.zonasInteres) {
      payload.zonasInteres = form.zonasInteres
        .split(",")
        .map((z) => z.trim())
        .filter(Boolean);
    }

    try {
      await apiFetch("/usuarios/perfil", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      await refreshUser();
      setSuccess("Perfil actualizado");
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const fieldClass =
    "w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 outline-none transition-all bg-white text-slate-900 disabled:bg-slate-50 disabled:text-slate-500";

  return (
    <div className="bg-slate-50 font-sans text-slate-900 min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-grow pt-24 pb-16">
          <div className="max-w-2xl mx-auto px-4">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 md:p-10">
              <div className="flex items-center justify-between mb-8">
                <h1 className="text-2xl font-bold text-slate-900">Mi Perfil</h1>
                {!editing && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(true)}
                  >
                    Editar
                  </Button>
                )}
              </div>

              {error && (
                <div
                  role="alert"
                  className="mb-6 p-3 rounded-lg bg-red-50 border border-red-100 text-red-700 text-sm"
                >
                  {error}
                </div>
              )}
              {success && (
                <div
                  role="status"
                  className="mb-6 p-3 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm"
                >
                  {success}
                </div>
              )}

              <form onSubmit={handleSave} className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={user?.email ?? ""}
                    disabled
                    className={fieldClass}
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    El email no se puede cambiar
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Teléfono
                  </label>
                  <input
                    type="tel"
                    value={form.telefono}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, telefono: e.target.value }))
                    }
                    disabled={!editing}
                    placeholder="+57 300 123 4567"
                    className={fieldClass}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      Edad
                    </label>
                    <input
                      type="number"
                      value={form.edad}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, edad: e.target.value }))
                      }
                      disabled={!editing}
                      placeholder="30"
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      Ciudad de origen
                    </label>
                    <input
                      type="text"
                      value={form.ciudadOrigen}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, ciudadOrigen: e.target.value }))
                      }
                      disabled={!editing}
                      placeholder="Bogotá"
                      className={fieldClass}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      Presupuesto mínimo
                    </label>
                    <input
                      type="number"
                      value={form.presupuestoMin}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          presupuestoMin: e.target.value,
                        }))
                      }
                      disabled={!editing}
                      placeholder="$800,000"
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      Presupuesto máximo
                    </label>
                    <input
                      type="number"
                      value={form.presupuestoMax}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          presupuestoMax: e.target.value,
                        }))
                      }
                      disabled={!editing}
                      placeholder="$2,500,000"
                      className={fieldClass}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Zonas de interés
                  </label>
                  <input
                    type="text"
                    value={form.zonasInteres}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, zonasInteres: e.target.value }))
                    }
                    disabled={!editing}
                    placeholder="chapinero, usaquén, cedritos"
                    className={fieldClass}
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Separadas por coma
                  </p>
                </div>

                {editing && (
                  <div className="flex gap-3 pt-4">
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={saving}
                    >
                      {saving ? "Guardando..." : "Guardar cambios"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setEditing(false)}
                      disabled={saving}
                    >
                      Cancelar
                    </Button>
                  </div>
                )}
              </form>
            </div>

            {user && (
              <div className="mt-8">
                <DeleteAccountSection
                  email={user.email}
                  onDeleted={handleAccountDeleted}
                />
              </div>
            )}
          </div>
        </main>
        <Footer />
    </div>
  );
}

export default function PerfilPage() {
  const { user } = useAuth();
  const versionUsuario = user
    ? [
        user.id,
        user.telefono,
        user.edad,
        user.ciudadOrigen,
        user.presupuestoMin,
        user.presupuestoMax,
        user.zonasInteres.join(","),
      ].join(":")
    : "sin-usuario";

  return (
    <RequireAuth>
      {user ? <PerfilPageContenido key={versionUsuario} user={user} /> : null}
    </RequireAuth>
  );
}
