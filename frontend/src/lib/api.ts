const BASE_URL = import.meta.env.PROD
  ? import.meta.env.VITE_API_URL_PRODUCTION
  : import.meta.env.VITE_API_URL_DEVELOPMENT;

const TOKEN_KEY = "rentia_token";

export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY) || "";

  const headers = new Headers(options.headers || {});

  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const isAuthEndpoint = endpoint.startsWith("/auth/");
  if (response.status === 401 && !isAuthEndpoint) {
    auth.logout();
  }

  const data =
    response.status === 204 ? null : await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error || data?.message || "Error en la solicitud");
  }

  return data as T;
}

export const auth = {
  setToken: (token: string) => {
    localStorage.setItem(TOKEN_KEY, token);
  },
  getToken: () => localStorage.getItem(TOKEN_KEY) || "",
  isAuthenticated: () => Boolean(localStorage.getItem(TOKEN_KEY)),
  clearToken: () => {
    localStorage.removeItem(TOKEN_KEY);
  },
  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
  },
};
