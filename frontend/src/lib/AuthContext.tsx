import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { Navigate } from "react-router-dom";
import { auth, apiFetch } from "./api";

interface User {
  id: string;
  email: string;
  zonasInteres: string[];
  edad: number | null;
  ciudadOrigen: string | null;
  telefono: string | null;
  presupuestoMin: string | null;
  presupuestoMax: string | null;
  googleId: string | null;
  fechaCreacion: string;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (token: string) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const isAuthenticated = user !== null;

  const refreshUser = useCallback(async () => {
    if (!auth.isAuthenticated()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const res = await apiFetch<{ success: boolean; perfil: User }>(
        "/usuarios/perfil",
      );
      setUser(res.perfil);
    } catch {
      auth.logout();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = useCallback(
    (token: string) => {
      auth.setToken(token);
      refreshUser();
    },
    [refreshUser],
  );

  const logout = useCallback(() => {
    auth.logout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, isAuthenticated, login, logout, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="animate-spin w-8 h-8 border-3 border-emerald-700 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
