import type { ApiErrorBody } from './types';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.status = body.status;
    this.code = body.code;
  }
  get isUnauthorized() { return this.status === 401; }
  get isSessionExpired() { return this.code === 'SESSION_EXPIRED'; }
}

export const ACTIVITY_EVENT = 'olb:activity';
export const UNAUTHORIZED_EVENT = 'olb:unauthorized';

function readCookie(name: string): string | undefined {
  return document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(name + '='))
    ?.slice(name.length + 1);
}

export function savedUserId(): string {
  const v = readCookie('olb_uid');
  return v ? decodeURIComponent(v) : '';
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body != null) headers.set('Content-Type', 'application/json');
  if (MUTATING.has(method) && path.startsWith('/api/secure/')) {
    const token = readCookie('XSRF-TOKEN');
    if (token) headers.set('X-XSRF-TOKEN', token);
  }
  const res = await fetch(path, { ...init, method, headers, credentials: 'include', cache: 'no-store' });
  if (res.status === 204) {
    window.dispatchEvent(new Event(ACTIVITY_EVENT));
    return undefined as T;
  }
  const text = await res.text();
  let json: unknown = undefined;
  try { json = text ? JSON.parse(text) : undefined; } catch { json = undefined; }
  if (!res.ok) {
    const body: ApiErrorBody = isErrorBody(json)
      ? json
      : { ok: false, status: res.status, code: res.status === 404 ? 'NOT_FOUND' : 'HTTP_' + res.status, message: 'We\u2019re sorry, Online Banking is temporarily unavailable.' };
    const err = new ApiError(body);
    if (err.isUnauthorized && path.startsWith('/api/secure/')) {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT, { detail: err }));
    } else if (res.status < 500) {
      // The server still touched the session (e.g. a 422 quote), so keep the inactivity timer in step.
      window.dispatchEvent(new Event(ACTIVITY_EVENT));
    }
    throw err;
  }
  window.dispatchEvent(new Event(ACTIVITY_EVENT));
  return json as T;
}

function isErrorBody(v: unknown): v is ApiErrorBody {
  return typeof v === 'object' && v !== null && 'code' in v && 'message' in v && 'status' in v;
}

export function postJson<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) });
}
