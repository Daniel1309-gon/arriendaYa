import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, auth } from "../lib/api";

type AuthSuccess = { success: boolean; token: string };

export function useGoogleAuth(onSuccess: (token: string) => void) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loginWithIdToken = useCallback(
    async (idToken: string) => {
      if (!idToken) {
        setError("No se recibió el token de Google");
        return false;
      }

      setError("");
      setLoading(true);
      try {
        const res = await apiFetch<AuthSuccess>("/auth/google", {
          method: "POST",
          body: JSON.stringify({ idToken }),
        });
        auth.setToken(res.token);
        if (mounted.current) onSuccess(res.token);
        return true;
      } catch (err) {
        if (mounted.current) {
          setError(
            err instanceof Error
              ? err.message
              : "Error al iniciar sesión con Google",
          );
        }
        return false;
      } finally {
        if (mounted.current) setLoading(false);
      }
    },
    [onSuccess],
  );

  return {
    loading,
    error,
    loginWithIdToken,
    clearError: () => setError(""),
    setError,
  };
}
