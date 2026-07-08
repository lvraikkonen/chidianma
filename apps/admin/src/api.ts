const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const TOKEN_KEY = "lunchAdminSessionToken";

export function saveAdminToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function getAdminToken(): string {
  return window.localStorage.getItem(TOKEN_KEY) ?? "";
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAdminToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {})
    }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<T>;
}
