import { useId, useState, type FormEvent } from "react";
import type { AccountRecoveryController } from "../../hooks/useAccountRecovery";
import { GoogleSignInButton } from "./GoogleSignInButton";
import { OtpInput } from "./OtpInput";
import { Button } from "../ui/Button";

interface AccountRecoveryPanelProps {
  recovery: AccountRecoveryController;
}

export function AccountRecoveryPanel({ recovery }: AccountRecoveryPanelProps) {
  const emailFieldId = useId();
  const otpFieldId = useId();
  const [otp, setOtp] = useState("");

  const handleRequestCode = async (event: FormEvent) => {
    event.preventDefault();
    await recovery.requestCode();
  };

  const handleVerifyCode = async (event: FormEvent) => {
    event.preventDefault();
    await recovery.verifyCode(otp);
  };

  if (recovery.step === "request") {
    return (
      <div className="space-y-6">
        <form onSubmit={handleRequestCode} className="space-y-6" noValidate>
          <div>
            <label
              htmlFor={emailFieldId}
              className="block text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2"
            >
              Correo electrónico
            </label>
            <input
              id={emailFieldId}
              type="email"
              name="email"
              autoComplete="email"
              value={recovery.email}
              onChange={(event) => recovery.setEmail(event.target.value)}
              required
              placeholder="tu@email.com"
              disabled={recovery.loading}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 outline-none transition-all bg-white text-slate-900 placeholder:text-slate-400 disabled:opacity-50"
            />
          </div>
          <Button
            variant="primary"
            fullWidth
            size="lg"
            type="submit"
            disabled={recovery.loading || !recovery.email.trim()}
          >
            {recovery.loading ? "Enviando..." : "Solicitar recuperación"}
          </Button>
        </form>

        <div className="relative flex items-center">
          <div className="grow border-t border-slate-200" />
          <span className="px-3 text-xs text-slate-400">o usa</span>
          <div className="grow border-t border-slate-200" />
        </div>

        <GoogleSignInButton
          disabled={recovery.loading}
          onCredential={(idToken) => recovery.loginWithGoogle(idToken)}
          onError={() => recovery.setError("Error al verificar la cuenta con Google")}
        />
      </div>
    );
  }

  if (recovery.step === "verify") {
    return (
      <form onSubmit={handleVerifyCode} className="space-y-6">
        <div>
          <p className="text-center text-sm text-slate-500 mb-1">
            Código enviado a{" "}
            <span className="font-semibold text-slate-700">{recovery.email}</span>
          </p>
          <button
            type="button"
            onClick={recovery.resetToEmail}
            className="block mx-auto mb-4 text-xs text-emerald-700 font-semibold hover:underline"
          >
            Cambiar correo
          </button>
          <label
            htmlFor={otpFieldId}
            className="block text-center text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4"
          >
            Código de recuperación
          </label>
          <OtpInput
            id={otpFieldId}
            value={otp}
            onChange={(value) => {
              setOtp(value);
              recovery.clearError();
            }}
            disabled={recovery.loading}
            autoFocus
          />
        </div>
        <Button
          variant="primary"
          fullWidth
          size="lg"
          type="submit"
          disabled={recovery.loading || otp.length !== 6}
        >
          {recovery.loading ? "Verificando..." : "Verificar identidad"}
        </Button>
        <p className="text-center text-xs text-slate-500">
          ¿No recibiste el código?{" "}
          {recovery.canResend ? (
            <button
              type="button"
              onClick={() => recovery.resendCode()}
              className="text-emerald-700 font-semibold hover:underline"
            >
              Reenviar
            </button>
          ) : (
            <span className="text-slate-400">Reenviar en {recovery.resendIn}s</span>
          )}
        </p>
      </form>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm leading-relaxed text-slate-600">
        Tu cuenta y tus inmuebles se conservarán durante el periodo de gracia.
        Confirma para reactivar la cuenta y volver a publicar tus inmuebles.
      </p>
      <Button
        variant="primary"
        fullWidth
        size="lg"
        type="button"
        onClick={() => recovery.confirm()}
        disabled={recovery.loading}
      >
        {recovery.loading ? "Reactivando..." : "Reactivar cuenta"}
      </Button>
      <button
        type="button"
        onClick={recovery.reset}
        disabled={recovery.loading}
        className="block mx-auto text-xs text-slate-500 hover:text-emerald-700 hover:underline disabled:opacity-50"
      >
        Cancelar
      </button>
    </div>
  );
}
