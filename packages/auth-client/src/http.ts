import { AuthConfigError, OAuthError } from './errors.js';

export type FetchLike = typeof fetch;

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** Tokens only travel over HTTPS; plain HTTP is allowed for loopback (local IdPs, tests). */
export function assertSecureUrl(raw: string, what: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AuthConfigError(`${what} is not a valid URL: ${raw}`);
  }
  if (url.protocol === 'https:') return url;
  if (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname)) return url;
  throw new AuthConfigError(`${what} must use https (got ${raw})`);
}

export async function getJson<T>(fetchImpl: FetchLike, url: string): Promise<{ status: number; body: T | null }> {
  const res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return { status: res.status, body: null };
  return { status: res.status, body: (await res.json()) as T };
}

/** POSTs an `application/x-www-form-urlencoded` body and throws OAuthError on an OAuth error response. */
export async function postForm<T>(fetchImpl: FetchLike, url: string, params: Record<string, string | undefined>): Promise<T> {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') body.set(key, value);
  }
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    // non-JSON error bodies are reported by status below
  }
  if (!res.ok || (json && typeof json.error === 'string')) {
    throw new OAuthError(json?.error || `http_${res.status}`, json?.error_description, res.status);
  }
  return json as T;
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error('Aborted'));
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal!.reason ?? new Error('Aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
