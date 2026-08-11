import {
  useCallback,
  useEffect,
  useState,
} from "react";
import { auth, apiFetch } from "./api";
import { AuthContext, type User } from "./auth-context";

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
    void Promise.resolve().then(() => refreshUser());
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
