import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, auth } from "../lib/api";

export type OtpStep = "request" | "verify";

const RESEND_COOLDOWN_S = 45;

type AuthSuccess = { success: boolean; token: string };

export function useOtpLogin(onSuccess: (token: string) => void) {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<OtpStep>("request");
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
      setResendIn((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [resendIn]);

  const safe = useCallback(<T,>(fn: () => T) => {
    if (mounted.current) fn();
  }, []);

  const requestCode = useCallback(
    async (nextEmail?: string) => {
      const target = (nextEmail ?? email).trim().toLowerCase();
      if (!target) {
        setError("Ingresa un correo válido");
        return false;
      }

      setError("");
      setInfo("");
      setLoading(true);
      try {
        await apiFetch<{ success: boolean }>("/auth/otp/request", {
          method: "POST",
          body: JSON.stringify({ email: target }),
        });
        safe(() => {
          setEmail(target);
          setStep("verify");
          setInfo("Te enviamos un código de 6 dígitos. Revisa tu correo.");
          setResendIn(RESEND_COOLDOWN_S);
        });
        return true;
      } catch (err) {
        safe(() =>
          setError(
            err instanceof Error ? err.message : "Error al enviar el código",
          ),
        );
        return false;
      } finally {
        safe(() => setLoading(false));
      }
    },
    [email, safe],
  );

  const verifyCode = useCallback(
    async (codigo: string) => {
      if (codigo.length !== 6) {
        setError("Ingresa los 6 dígitos del código");
        return false;
      }

      setError("");
      setLoading(true);
      try {
        const res = await apiFetch<AuthSuccess>("/auth/otp/verify", {
          method: "POST",
          body: JSON.stringify({ email, codigo }),
        });
        auth.setToken(res.token);
        onSuccess(res.token);
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
    [email, onSuccess, safe],
  );

  const resendCode = useCallback(async () => {
    if (resendIn > 0 || loading) return false;
    return requestCode(email);
  }, [email, loading, requestCode, resendIn]);

  const resetToEmail = useCallback(() => {
    setStep("request");
    setError("");
    setInfo("");
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
    resendCode,
    resetToEmail,
    clearError: () => setError(""),
  };
}
