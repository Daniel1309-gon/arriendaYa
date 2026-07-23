import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "../components/layout/Navbar";
import { Footer } from "../components/layout/Footer";
import { Button } from "../components/ui/Button";
import { OtpInput } from "../components/auth/OtpInput";
import { GoogleSignInButton } from "../components/auth/GoogleSignInButton";
import { useOtpLogin } from "../hooks/useOtpLogin";
import { useGoogleAuth } from "../hooks/useGoogleAuth";
import { useAuth } from "../lib/AuthContext";

type AuthTab = "email" | "google";

const HERO_STATS = [
  { value: "500+", label: "Inmuebles" },
  { value: "24h", label: "Respuesta" },
] as const;

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80";

export default function LoginPage() {
  const navigate = useNavigate();
  const { isAuthenticated, login } = useAuth();
  const emailFieldId = useId();
  const otpFieldId = useId();
  const [activeTab, setActiveTab] = useState<AuthTab>("email");
  const [otp, setOtp] = useState("");

  const goHome = useCallback(
    (token: string) => {
      login(token);
      navigate("/", { replace: true });
    },
    [navigate, login],
  );

  const otpLogin = useOtpLogin(goHome);
  const googleAuth = useGoogleAuth(goHome);

  useEffect(() => {
    if (isAuthenticated) goHome("");
  }, [goHome, isAuthenticated]);

  useEffect(() => {
    if (otpLogin.step === "verify") setOtp("");
  }, [otpLogin.step]);

  const loading = otpLogin.loading || googleAuth.loading;
  const error =
    activeTab === "email" ? otpLogin.error : googleAuth.error || otpLogin.error;
  const info = activeTab === "email" ? otpLogin.info : "";

  const handleRequestCode = async (e: FormEvent) => {
    e.preventDefault();
    await otpLogin.requestCode();
  };

  const handleVerifyCode = async (e: FormEvent) => {
    e.preventDefault();
    await otpLogin.verifyCode(otp);
  };

  const switchTab = (tab: AuthTab) => {
    setActiveTab(tab);
    otpLogin.clearError();
    googleAuth.clearError();
  };

  return (
    <div className="bg-slate-50 font-sans text-slate-900 min-h-screen flex flex-col">
      <Navbar />

      <main className="grow flex flex-col md:flex-row pt-16 md:pt-20">
        <section
          className="relative w-full md:w-[60%] min-h-[40vh] md:min-h-full overflow-hidden flex items-center px-8 md:px-16 py-20"
          aria-label="Presentación"
        >
          <div className="absolute inset-0 z-0">
            <div
              className="w-full h-full bg-cover bg-center"
              style={{ backgroundImage: `url('${HERO_IMAGE}')` }}
              role="img"
              aria-label="Interior de apartamento moderno en Bogotá"
            />
            <div className="absolute inset-0 bg-linear-to-br from-emerald-900/70 to-emerald-400/30" />
          </div>

          <div className="relative z-10 max-w-2xl text-white">
            <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight tracking-tight">
              Encuentra tu hogar ideal en Bogotá
            </h1>
            <p className="text-lg md:text-xl opacity-90 max-w-lg leading-relaxed">
              Accede a tu cuenta para guardar tus búsquedas, favoritos y recibir
              alertas personalizadas en el mercado inmobiliario más dinámico de
              Colombia.
            </p>
            <div className="mt-12 flex gap-8 items-center animate-fade-in-up">
              {HERO_STATS.map((stat, i) => (
                <div key={stat.label} className="flex items-center">
                  {i > 0 && <div className="w-px h-10 bg-white/30 mr-8" />}
                  <div className="flex flex-col">
                    <span className="text-3xl font-bold">{stat.value}</span>
                    <span className="text-sm opacity-80 uppercase tracking-wider font-semibold">
                      {stat.label}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          className="w-full md:w-[40%] bg-[#f7f9fb] flex flex-col justify-center items-center px-6 py-12 md:px-12"
          aria-labelledby="login-heading"
        >
          <div className="w-full max-w-md">
            <div className="bg-white/95 backdrop-blur-md p-8 md:p-10 rounded-2xl shadow-[0_4px_20px_rgba(0,66,43,0.04)] border border-slate-100 animate-zoom-in">
              <h2
                id="login-heading"
                className="text-2xl font-bold text-emerald-700 mb-8"
              >
                Iniciar Sesión
              </h2>

              <div
                className="flex border-b border-slate-200 mb-8"
                role="tablist"
                aria-label="Método de inicio de sesión"
              >
                <button
                  type="button"
                  role="tab"
                  id="tab-email"
                  aria-selected={activeTab === "email"}
                  aria-controls="panel-email"
                  tabIndex={activeTab === "email" ? 0 : -1}
                  onClick={() => switchTab("email")}
                  className={`flex-1 pb-4 text-sm font-semibold transition-all ${
                    activeTab === "email"
                      ? "border-b-2 border-emerald-700 text-emerald-700"
                      : "text-slate-400 hover:text-emerald-700"
                  }`}
                >
                  Email
                </button>
                <button
                  type="button"
                  role="tab"
                  id="tab-google"
                  aria-selected={activeTab === "google"}
                  aria-controls="panel-google"
                  tabIndex={activeTab === "google" ? 0 : -1}
                  onClick={() => switchTab("google")}
                  className={`flex-1 pb-4 text-sm font-semibold transition-all ${
                    activeTab === "google"
                      ? "border-b-2 border-emerald-700 text-emerald-700"
                      : "text-slate-400 hover:text-emerald-700"
                  }`}
                >
                  Google
                </button>
              </div>

              {error && (
                <div
                  role="alert"
                  className="mb-6 p-3 rounded-lg bg-red-50 border border-red-100 text-red-700 text-sm animate-fade-in-up"
                >
                  {error}
                </div>
              )}
              {info && (
                <div
                  role="status"
                  className="mb-6 p-3 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm animate-fade-in-up"
                >
                  {info}
                </div>
              )}

              {activeTab === "email" && (
                <div
                  id="panel-email"
                  role="tabpanel"
                  aria-labelledby="tab-email"
                  className="space-y-6"
                >
                  {otpLogin.step === "request" ? (
                    <form
                      onSubmit={handleRequestCode}
                      className="space-y-6"
                      noValidate
                    >
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
                          value={otpLogin.email}
                          onChange={(e) => otpLogin.setEmail(e.target.value)}
                          required
                          placeholder="tu@email.com"
                          disabled={loading}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 outline-none transition-all bg-white text-slate-900 placeholder:text-slate-400 disabled:opacity-50"
                        />
                      </div>
                      <Button
                        variant="primary"
                        fullWidth
                        size="lg"
                        type="submit"
                        disabled={loading || !otpLogin.email.trim()}
                      >
                        {loading ? "Enviando..." : "Enviar código"}
                      </Button>
                    </form>
                  ) : (
                    <form onSubmit={handleVerifyCode} className="space-y-6">
                      <div>
                        <p className="text-center text-sm text-slate-500 mb-1">
                          Código enviado a{" "}
                          <span className="font-semibold text-slate-700">
                            {otpLogin.email}
                          </span>
                        </p>
                        <button
                          type="button"
                          onClick={otpLogin.resetToEmail}
                          className="block mx-auto mb-4 text-xs text-emerald-700 font-semibold hover:underline"
                        >
                          Cambiar correo
                        </button>
                        <label
                          htmlFor={otpFieldId}
                          className="block text-center text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4"
                        >
                          Código de verificación
                        </label>
                        <OtpInput
                          id={otpFieldId}
                          value={otp}
                          onChange={(v) => {
                            setOtp(v);
                            otpLogin.clearError();
                          }}
                          disabled={loading}
                          autoFocus
                        />
                      </div>
                      <Button
                        variant="primary"
                        fullWidth
                        size="lg"
                        type="submit"
                        disabled={loading || otp.length !== 6}
                      >
                        {loading ? "Verificando..." : "Verificar"}
                      </Button>
                      <p className="text-center text-xs text-slate-500">
                        ¿No recibiste el código?{" "}
                        {otpLogin.canResend ? (
                          <button
                            type="button"
                            onClick={() => otpLogin.resendCode()}
                            className="text-emerald-700 font-semibold hover:underline"
                          >
                            Reenviar
                          </button>
                        ) : (
                          <span className="text-slate-400">
                            Reenviar en {otpLogin.resendIn}s
                          </span>
                        )}
                      </p>
                    </form>
                  )}
                </div>
              )}

              {activeTab === "google" && (
                <div
                  id="panel-google"
                  role="tabpanel"
                  aria-labelledby="tab-google"
                  className="space-y-6 py-4"
                >
                  <GoogleSignInButton
                    disabled={loading}
                    onCredential={(idToken) =>
                      googleAuth.loginWithIdToken(idToken)
                    }
                    onError={() =>
                      googleAuth.setError("Error al autenticar con Google")
                    }
                  />
                  {!import.meta.env.VITE_GOOGLE_CLIENT_ID && (
                    <p className="text-center text-xs text-amber-700">
                      Configura <code>VITE_GOOGLE_CLIENT_ID</code> en el
                      frontend.
                    </p>
                  )}
                </div>
              )}

              <p className="mt-12 text-center text-xs text-slate-500 max-w-70 mx-auto">
                ¿No tienes cuenta? Al iniciar sesión se crea una
                automáticamente.
              </p>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
