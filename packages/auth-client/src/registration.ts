import { AuthConfigError, OAuthError } from './errors.js';
import { assertSecureUrl, type FetchLike } from './http.js';
import type { AuthServerMetadata, StoredRegistration } from './types.js';

export interface RegisterClientOptions {
  redirectUris: string[];
  grantTypes: string[];
  clientName?: string;
  scope?: string;
}

/** RFC 7591 dynamic client registration of a public client (PKCE, no secret requested). */
export async function registerClient(
  fetchImpl: FetchLike,
  metadata: AuthServerMetadata,
  options: RegisterClientOptions
): Promise<StoredRegistration> {
  if (!metadata.registration_endpoint) {
    throw new AuthConfigError(`IdP ${metadata.issuer} does not support dynamic client registration; configure a clientId`);
  }
  assertSecureUrl(metadata.registration_endpoint, 'registration_endpoint');
  const res = await fetchImpl(metadata.registration_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_name: options.clientName ?? 'Curator',
      redirect_uris: options.redirectUris,
      grant_types: options.grantTypes,
      response_types: options.grantTypes.includes('authorization_code') ? ['code'] : [],
      token_endpoint_auth_method: 'none',
      ...(options.scope ? { scope: options.scope } : {}),
    }),
  });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    // reported by status below
  }
  if (!res.ok || !body?.client_id) {
    throw new OAuthError(body?.error || `http_${res.status}`, body?.error_description || 'Client registration failed', res.status);
  }
  return {
    issuer: metadata.issuer,
    clientId: String(body.client_id),
    clientSecret: body.client_secret ? String(body.client_secret) : undefined,
    redirectUris: Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String) : options.redirectUris,
    registeredAt: Date.now(),
  };
}
