import { createContext, useContext } from "react";

export interface User {
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

export interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (token: string) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
