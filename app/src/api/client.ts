import { transitionError } from '../domain/statusFlow';
import { REQ_TYPE } from '../config';

export class ApiError extends Error {
  readonly status?: number;
  readonly code?: number;
  constructor(message: string, opts: { status?: number; code?: number } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = opts.status;
    this.code = opts.code;
  }
}

/** The Cogover session is gone (401/403, proxy auth error or CSRF rejected): the user must sign in again. */
export class SessionExpiredError extends ApiError {
  constructor(message = 'Phiên đăng nhập đã hết hạn', opts: { status?: number; code?: number } = {}) {
    super(message, opts);
    this.name = 'SessionExpiredError';
  }
}

export class NetworkError extends ApiError {
  constructor(message = 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.') {
    super(message);
    this.name = 'NetworkError';
  }
}

export const CSRF_COOKIE = 'XSRF-TOKEN';
/** Cogover business code for a rejected CSRF token (CSRF_TOKEN_NOT_VALID). */
export const CSRF_ERROR_CODE = 19000;

/** Reads a cookie set by the Workspace for this origin. Never logged or stored elsewhere. */
export function readCookie(name: string, source: string = typeof document === 'undefined' ? '' : document.cookie): string {
  for (const part of source.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() !== name) continue;
    const value = part.slice(i + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return '';
}

export function buildHeaders(service: number): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-req-type': String(REQ_TYPE),
    'x-req-service': String(service),
  };
  const token = readCookie(CSRF_COOKIE);
  if (token) {
    headers['x-csrf-token'] = token;
    headers['x-xsrf-token'] = token;
  }
  return headers;
}

interface Envelope<T> {
  r?: unknown;
  msg?: unknown;
  data?: T;
}

const SESSION_HINT = /session|token|unauthori[sz]ed|forbidden|login|phiên|đăng nhập|xác thực/i;

export interface PostOptions {
  keepalive?: boolean;
  signal?: AbortSignal;
}

/**
 * POSTs JSON to a same-origin Cogover API path with the user's session cookie and CSRF headers.
 * Resolves with `data` when `{ r: 0 }`, otherwise throws ApiError / SessionExpiredError / NetworkError.
 */
export async function apiPost<T>(path: string, service: number, body: unknown, opts: PostOptions = {}): Promise<T> {
  return send<T>(path, {
    headers: buildHeaders(service),
    body: JSON.stringify(body),
    keepalive: opts.keepalive,
    signal: opts.signal,
  });
}

/**
 * Multipart upload (file server): CSRF headers only — no `x-req-service` / `x-req-type`, and no
 * content-type (the browser writes the multipart boundary). Same error handling as apiPost.
 */
export async function apiUpload<T>(path: string, form: FormData, opts: { signal?: AbortSignal } = {}): Promise<T> {
  return send<T>(path, { headers: csrfHeaders(), body: form, signal: opts.signal });
}

/** GET of a same-origin Cogover API path (object security settings): session cookie + CSRF headers only. */
export async function apiGet<T>(path: string, opts: { signal?: AbortSignal } = {}): Promise<T> {
  return send<T>(path, { method: 'GET', headers: csrfHeaders(), signal: opts.signal });
}

function csrfHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = readCookie(CSRF_COOKIE);
  if (token) {
    headers['x-csrf-token'] = token;
    headers['x-xsrf-token'] = token;
  }
  return headers;
}

async function send<T>(path: string, init: Pick<RequestInit, 'method' | 'headers' | 'body' | 'keepalive' | 'signal'>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method: 'POST', credentials: 'same-origin', ...init });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new NetworkError();
  }

  let json: Envelope<T> | null = null;
  try {
    json = (await res.json()) as Envelope<T>;
  } catch {
    json = null;
  }
  const msg = typeof json?.msg === 'string' && json.msg.trim() ? json.msg.trim() : '';
  const code = typeof json?.r === 'number' ? json.r : undefined;

  if (res.status === 401 || res.status === 403) {
    throw new SessionExpiredError(undefined, { status: res.status, code });
  }
  if (res.headers.get('x-proxy-error') === '1' && SESSION_HINT.test(msg)) {
    throw new SessionExpiredError(undefined, { status: res.status, code });
  }
  if (code === CSRF_ERROR_CODE) {
    throw new SessionExpiredError(undefined, { status: res.status, code });
  }
  if (!res.ok) {
    throw new ApiError(msg || `Máy chủ trả lỗi (HTTP ${res.status}).`, { status: res.status, code });
  }
  if (!json || typeof json !== 'object') {
    throw new ApiError('Phản hồi từ máy chủ không hợp lệ.', { status: res.status });
  }
  if (code !== 0) {
    throw new ApiError(msg || `Thao tác không thành công (mã ${String(json.r ?? '?')}).`, { status: res.status, code });
  }
  return json.data as T;
}

/** Message to show for any error thrown by the API layer. */
export function errorMessage(e: unknown): string {
  const msg = e instanceof Error && e.message ? e.message : '';
  if (!msg) return 'Đã xảy ra lỗi không xác định.';
  return transitionError(msg) ?? msg; // a status change the workflow refuses, in Vietnamese
}

export const isSessionExpired = (e: unknown): e is SessionExpiredError => e instanceof SessionExpiredError;
