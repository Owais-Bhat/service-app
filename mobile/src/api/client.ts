import * as SecureStore from 'expo-secure-store';

// Unlike the web app, a phone can't rely on same-origin/localhost tricks to
// reach the backend — set this to your deployed API origin, or your dev
// machine's LAN IP (e.g. http://192.168.1.20:5000) when running `expo start`
// and testing on a physical device/emulator.
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://your-domain.example.com/api';

const TOKEN_KEY = 'auth_token';

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string | null): Promise<void> {
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const fullUrl = `${API_BASE_URL}${path}`;
  console.log(`[API Request] URL: ${fullUrl}, Method: ${options.method || 'GET'}`);
  console.log(`[API Config] EXPO_PUBLIC_API_BASE_URL is:`, process.env.EXPO_PUBLIC_API_BASE_URL);

  try {
    const res = await fetch(fullUrl, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.log(`[API Error] Status: ${res.status}`, data);
      throw new ApiError(data.error || `Request failed (${res.status})`, res.status);
    }
    return data as T;
  } catch (err) {
    console.log(`[API Fetch Error] Failed to reach ${fullUrl}. Error:`, err);
    throw err;
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
};

// Mirrors the web app's generic /api/data/:table compatibility layer
// (src/supabase.js) — same query-param conventions (eq, order, in, select).
export async function dataGet<T>(table: string, params: Record<string, string | string[]> = {}): Promise<T> {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach((v) => sp.append(key, v));
    else sp.set(key, value);
  }
  return request<T>(`/data/${table}?${sp.toString()}`, { method: 'GET' });
}

export async function dataPost<T>(table: string, body: unknown): Promise<T> {
  return request<T>(`/data/${table}`, { method: 'POST', body: JSON.stringify(body) });
}

export async function dataPatch<T>(table: string, eq: string | string[], body: unknown): Promise<T> {
  const sp = new URLSearchParams();
  (Array.isArray(eq) ? eq : [eq]).forEach((v) => sp.append('eq', v));
  return request<T>(`/data/${table}?${sp.toString()}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export async function postForm<T>(path: string, form: FormData): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const fullUrl = `${API_BASE_URL}${path}`;
  const res = await fetch(fullUrl, { method: 'POST', headers, body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status);
  return data as T;
}
