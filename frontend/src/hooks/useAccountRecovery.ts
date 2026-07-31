import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, auth } from "../lib/api";

export type AccountRecoveryStep = "request" | "verify" | "confirm";

type RecoveryTokenResponse = {
  success: boolean;
  recoveryToken: string;
  expiresIn: number;
};

type RecoverySuccess = {
  success: boolean;
  token: string;
};

const RESEND_COOLDOWN_S = 45;

export interface AccountRecoveryController {
  email: string;
  setEmail: (email: string) => void;
  step: AccountRecoveryStep;
  loading: boolean;
  error: string;
  info: string;
  resendIn: number;
  canResend: boolean;
  requestCode: () => Promise<boolean>;
  verifyCode: (codigo: string) => Promise<boolean>;
  loginWithGoogle: (idToken: string) => Promise<boolean>;
  confirm: () => Promise<boolean>;
  resendCode: () => Promise<boolean>;
  resetToEmail: () => void;
  reset: () => void;
  clearError: () => void;
  setError: (message: string) => void;
}

export function useAccountRecovery(
  onSuccess: (token: string) => void,
): AccountRecoveryController {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<AccountRecoveryStep>("request");
  const [recoveryToken, setRecoveryToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = window.setInterval(() => {
      setResendIn((current) => (current <= 1 ? 0 : current - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [resendIn]);

  const safe = useCallback(<T,>(fn: () => T) => {
    if (mounted.current) fn();
  }, []);

  const requestCode = useCallback(async () => {
    const target = email.trim().toLowerCase();
    if (!target) {
      setError("Ingresa un correo válido");
      return false;
    }

    setError("");
    setInfo("");
    setLoading(true);

    try {
      await apiFetch<{ success: boolean }>("/auth/cuenta/recuperar", {
        method: "POST",
        body: JSON.stringify({ email: target }),
      });
      safe(() => {
        setEmail(target);
        setStep("verify");
        setInfo(
          "Si tu cuenta está dentro del periodo de recuperación, recibirás un código.",
        );
        setResendIn(RESEND_COOLDOWN_S);
      });
      return true;
    } catch (err) {
      safe(() =>
        setError(
          err instanceof Error ? err.message : "Error al solicitar la recuperación",
        ),
      );
      return false;
    } finally {
      safe(() => setLoading(false));
    }
  }, [email, safe]);

  const verifyCode = useCallback(
    async (codigo: string) => {
      if (codigo.length !== 6) {
        setError("Ingresa los 6 dígitos del código");
        return false;
      }

      setError("");
      setLoading(true);

      try {
        const res = await apiFetch<RecoveryTokenResponse>(
          "/auth/cuenta/recuperar/verificar",
          {
            method: "POST",
            body: JSON.stringify({ email, codigo }),
          },
        );
        safe(() => {
          setRecoveryToken(res.recoveryToken);
          setStep("confirm");
          setInfo("Tu identidad fue verificada. Confirma para reactivar la cuenta.");
        });
        return true;
      } catch (err) {
        safe(() =>
          setError(
            err instanceof Error ? err.message : "Código inválido o expirado",
          ),
        );
        return false;
      } finally {
        safe(() => setLoading(false));
      }
    },
    [email, safe],
  );

  const loginWithGoogle = useCallback(
    async (idToken: string) => {
      if (!idToken) {
        setError("No se recibió el token de Google");
        return false;
      }

      setError("");
      setLoading(true);

      try {
        const res = await apiFetch<RecoveryTokenResponse>(
          "/auth/cuenta/recuperar/google",
          {
            method: "POST",
            body: JSON.stringify({ idToken }),
          },
        );
        safe(() => {
          setRecoveryToken(res.recoveryToken);
          setStep("confirm");
          setInfo("Tu identidad fue verificada. Confirma para reactivar la cuenta.");
        });
        return true;
      } catch (err) {
        safe(() =>
          setError(
            err instanceof Error
              ? err.message
              : "Error al verificar la cuenta con Google",
          ),
        );
        return false;
      } finally {
        safe(() => setLoading(false));
      }
    },
    [safe],
  );

  const confirm = useCallback(async () => {
    if (!recoveryToken) {
      setError("La sesión de recuperación no es válida");
      return false;
    }

    setError("");
    setLoading(true);

    try {
      const res = await apiFetch<RecoverySuccess>(
        "/auth/cuenta/recuperar/confirmar",
        {
          method: "POST",
          body: JSON.stringify({ recoveryToken }),
        },
      );
      auth.setToken(res.token);
      onSuccess(res.token);
      return true;
    } catch (err) {
      safe(() =>
        setError(
          err instanceof Error ? err.message : "No se pudo reactivar la cuenta",
        ),
      );
      return false;
    } finally {
      safe(() => setLoading(false));
    }
  }, [onSuccess, recoveryToken, safe]);

  const resendCode = useCallback(async () => {
    if (resendIn > 0 || loading) return false;
    return requestCode();
  }, [loading, requestCode, resendIn]);

  const resetToEmail = useCallback(() => {
    setStep("request");
    setRecoveryToken("");
    setError("");
    setInfo("");
    setResendIn(0);
  }, []);

  const reset = useCallback(() => {
    setEmail("");
    setStep("request");
    setRecoveryToken("");
    setLoading(false);
    setError("");
    setInfo("");
    setResendIn(0);
  }, []);

  return {
    email,
    setEmail,
    step,
    loading,
    error,
    info,
    resendIn,
    canResend: resendIn === 0 && !loading,
    requestCode,
    verifyCode,
    loginWithGoogle,
    confirm,
    resendCode,
    resetToEmail,
    reset,
    clearError: () => setError(""),
    setError,
  };
}
