import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import * as Sharing from 'expo-sharing';

export const API_URL: string = ((Constants.expoConfig?.extra as any)?.apiUrl || 'http://10.0.2.2:3000').replace(/\/$/, '');
const KEY = 'ww_token';
let token: string | null = null;

export const tokenStore = {
  async load() { token = await SecureStore.getItemAsync(KEY); return token; },
  async set(t: string | null) { token = t; if (t) await SecureStore.setItemAsync(KEY, t); else await SecureStore.deleteItemAsync(KEY); },
  get: () => token,
};

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}
let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, { method: opts.method || (opts.body !== undefined ? 'POST' : 'GET'), headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
  } catch {
    throw new ApiError(0, `Can't reach the server (${API_URL}). Check your connection.`);
  }
  if (res.status === 401 && token) onUnauthorized();
  if (!res.ok) {
    const j: any = await res.json().catch(() => ({}));
    throw new ApiError(res.status, Array.isArray(j.message) ? j.message.join(', ') : j.message || `Error ${res.status}`, j.code);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}
export const get = <T = any>(p: string) => api<T>(p);
export const post = <T = any>(p: string, body: unknown = {}) => api<T>(p, { method: 'POST', body });
export const patch = <T = any>(p: string, body: unknown = {}) => api<T>(p, { method: 'PATCH', body });
export const del = <T = any>(p: string) => api<T>(p, { method: 'DELETE' });

/** Download a protected PDF and open the share sheet (save to Files, WhatsApp, print…). */
export async function downloadAndShare(path: string, filename: string) {
  const dest = new File(Paths.cache, filename);
  const file = await File.downloadFileAsync(`${API_URL}/api${path}`, dest, { headers: { authorization: `Bearer ${token}` }, idempotent: true });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: filename, UTI: 'com.adobe.pdf' });
  return file.uri;
}
