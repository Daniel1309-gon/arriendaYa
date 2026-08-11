import { useEffect, useId, useRef } from "react";
import { Button } from "./Button";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Botón de confirmar en rojo, para acciones destructivas (eliminar). */
  destructive?: boolean;
  loading?: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Diálogo de confirmación controlado, sobre el <dialog> nativo.
 *
 * Generaliza el patrón que ya usaba DeleteAccountSection (mismo show/close
 * vía useEffect, mismo cierre con Esc/backdrop delegado al evento nativo
 * "close") para no repetirlo en cada flujo de eliminar.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  destructive = false,
  loading = false,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // Esc y clic en el backdrop cierran el <dialog> nativo sin pasar por
    // nuestro onClick del botón Cancelar; hay que escuchar el evento "close"
    // para que el estado del padre (open) se mantenga sincronizado.
    const handleClose = () => onCancel();
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onCancel]);

  return (
    <dialog
      ref={dialogRef}
      className="rounded-2xl p-0 max-w-md w-[90%] backdrop:bg-slate-900/50 border-0 shadow-2xl"
      aria-labelledby={titleId}
    >
      <div className="bg-white p-6 md:p-8 rounded-2xl">
        <h2 id={titleId} className="text-xl font-bold text-slate-900 mb-2">
          {title}
        </h2>
        <div className="text-sm text-slate-600 leading-relaxed mb-6">
          {description}
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 p-3 rounded-lg bg-red-50 border border-red-100 text-red-700 text-sm"
          >
            {error}
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={onConfirm}
            disabled={loading}
            className={
              destructive
                ? "bg-red-600 hover:bg-red-700 focus:ring-red-600 shadow-md"
                : undefined
            }
          >
            {loading ? "Procesando..." : confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
