import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button } from "../ui/Button";
import { apiFetch } from "../../lib/api";

interface DeleteAccountSectionProps {
  email: string;
  onDeleted: (eliminacionProgramadaEn: string) => void;
}

const DELETE_CONFIRM_PROMPT = "Escribe tu correo para confirmar";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CO", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function DeleteAccountSection({
  email,
  onDeleted,
}: DeleteAccountSectionProps) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [scheduledFor, setScheduledFor] = useState<string | null>(null);
  const [showScheduledScreen, setShowScheduledScreen] = useState(false);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  const trimmed = confirmText.trim().toLowerCase();
  const expected = email.trim().toLowerCase();
  const isMatch = trimmed === expected;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      requestAnimationFrame(() => inputRef.current?.focus());
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => {
      setOpen(false);
      setConfirmText("");
      setAcknowledged(false);
      setError("");
    };
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, []);

  const closeModal = () => {
    dialogRef.current?.close();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!acknowledged) {
      setError("Debes confirmar que entiendes la ventana de 14 días");
      return;
    }
    if (!isMatch) {
      setError("El correo no coincide con el de tu cuenta");
      return;
    }

    setDeleting(true);
    try {
      const res = await apiFetch<{
        success: boolean;
        eliminacionProgramadaEn: string;
      }>("/usuarios/perfil", { method: "DELETE" });
      setScheduledFor(res.eliminacionProgramadaEn);
      setShowScheduledScreen(true);
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setDeleting(false);
    }
  };

  const handleContinue = () => {
    if (!scheduledFor) return;
    onDeleted(scheduledFor);
  };

  if (showScheduledScreen && scheduledFor) {
    return (
      <div
        className="bg-white border border-emerald-200 rounded-2xl p-6 md:p-8 shadow-sm animate-fade-in-up"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-3 mb-3">
          <svg
            className="w-8 h-8 text-emerald-600 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h3 className="text-lg font-bold text-slate-900">
            Cuenta programada para eliminación
          </h3>
        </div>
        <p className="text-sm text-slate-600 leading-relaxed mb-6">
          Tu cuenta y todos tus inmuebles dejarán de estar visibles el{" "}
          <span className="font-semibold text-slate-900">
            {formatDate(scheduledFor)}
          </span>
          . Durante los próximos 14 días puedes recuperarla desde la pantalla de
          inicio de sesión.
        </p>
        <Button variant="primary" onClick={handleContinue}>
          Entendido
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-red-200 rounded-2xl p-6 md:p-8 shadow-sm">
      <div className="flex items-start gap-3 mb-3">
        <svg
          className="w-6 h-6 text-red-500 shrink-0 mt-0.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <div>
          <h3 className="text-lg font-bold text-slate-900 mb-1">
            Eliminar mi cuenta
          </h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            Si eliminas tu cuenta, tus inmuebles dejarán de ser visibles
            inmediatamente y tus datos se conservarán durante 14 días. Después
            de ese período se eliminarán de forma permanente y no podrás
            recuperarla.
          </p>
        </div>
      </div>

      <Button
        variant="secondary"
        onClick={() => setOpen(true)}
        className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
      >
        Eliminar mi cuenta
      </Button>

      <dialog
        ref={dialogRef}
        className="rounded-2xl p-0 max-w-md w-[90%] backdrop:bg-slate-900/50 border-0 shadow-2xl"
        aria-labelledby={titleId}
      >
        <form onSubmit={handleSubmit} className="bg-white p-6 md:p-8 rounded-2xl">
          <h2
            id={titleId}
            className="text-xl font-bold text-slate-900 mb-2"
          >
            Confirmar eliminación
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed mb-6">
            Esta acción no se puede deshacer. Tu cuenta se eliminará
            permanentemente en 14 días.
          </p>

          {error && (
            <div
              role="alert"
              className="mb-4 p-3 rounded-lg bg-red-50 border border-red-100 text-red-700 text-sm"
            >
              {error}
            </div>
          )}

          <label className="flex items-start gap-2 mb-5 cursor-pointer">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              disabled={deleting}
              className="mt-1 w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
            />
            <span className="text-sm text-slate-700 leading-relaxed">
              Entiendo que mi cuenta se eliminará en 14 días y que podré
              recuperarla solo durante ese período.
            </span>
          </label>

          <div className="mb-6">
            <label
              htmlFor="delete-confirm"
              className="block text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2"
            >
              {DELETE_CONFIRM_PROMPT}
            </label>
            <p className="text-xs text-slate-500 mb-2">
              Tu correo: <span className="font-semibold">{email}</span>
            </p>
            <input
              ref={inputRef}
              id="delete-confirm"
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={deleting}
              autoComplete="off"
              placeholder={email}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 outline-none transition-all bg-white text-slate-900 disabled:opacity-50"
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={closeModal}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={deleting || !acknowledged || !isMatch}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600 shadow-md"
            >
              {deleting ? "Eliminando..." : "Eliminar cuenta"}
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
