import { AuthRequiredError } from './errors.js';
import type { FetchLike } from './http.js';
import type { CuratorAuthProvider } from './types.js';

/**
 * Wraps fetch with a bearer token from `provider`. On 401 it lets the provider react
 * (refresh / re-discover) and retries once. Request bodies must be replayable
 * (string, URLSearchParams, Blob, ...), not one-shot streams.
 */
export function createAuthFetch(provider: CuratorAuthProvider, baseFetch: FetchLike = fetch): FetchLike {
  const send = async (input: Parameters<FetchLike>[0], init?: RequestInit) => {
    const token = await provider.getAccessToken();
    if (!token) throw new AuthRequiredError(provider.name);
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    headers.set('Authorization', `Bearer ${token}`);
    return baseFetch(input, { ...init, headers });
  };

  return (async (input: Parameters<FetchLike>[0], init?: RequestInit) => {
    const response = await send(input, init);
    if (response.status !== 401) return response;
    if (!(await provider.handleUnauthorized(response.headers.get('www-authenticate')))) {
      throw new AuthRequiredError(provider.name);
    }
    return send(input, init);
  }) as FetchLike;
}
