import { OAuthError } from './errors.js';
import { postForm, type FetchLike } from './http.js';
import type { AudienceParam, AuthIdentity, AuthServerMetadata, IdpConfig, StoredAccessToken, TokenEndpointResponse } from './types.js';

/** Expire tokens slightly early so a token is never sent at the edge of its lifetime. */
export const EXPIRY_SKEW_MS = 60_000;

/** Decodes JWT claims WITHOUT verifying the signature. Client-side display/expiry only, never for authorization. */
export function decodeJwtClaims(token: string): Record<string, any> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

/**
 * Derives the logged-in identity from an id_token received directly from the token
 * endpoint over TLS (OIDC Core 3.1.3.7 allows TLS in place of signature checks here).
 * `iss` and `aud` are still checked so a token minted for another client is rejected.
 */
export function identityFromIdToken(idToken: string | undefined, issuer: string, clientId: string | undefined): AuthIdentity | undefined {
  if (!idToken) return undefined;
  const claims = decodeJwtClaims(idToken);
  if (!claims) throw new OAuthError('invalid_id_token', 'id_token is not a JWT');
  const trim = (v: string) => v.replace(/\/+$/, '');
  if (trim(String(claims.iss)) !== trim(issuer)) {
    throw new OAuthError('invalid_id_token', `id_token issuer ${claims.iss} does not match ${issuer}`);
  }
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!clientId || !audiences.includes(clientId)) {
    throw new OAuthError('invalid_id_token', `id_token audience does not include client ${clientId}`);
  }
  return {
    issuer,
    sub: String(claims.sub),
    email: claims.email,
    name: claims.name ?? claims.preferred_username,
  };
}

export function toStoredAccessToken(response: TokenEndpointResponse, now = Date.now()): StoredAccessToken {
  let expiresAt = response.expires_in ? now + response.expires_in * 1000 : undefined;
  if (!expiresAt) {
    const exp = decodeJwtClaims(response.access_token)?.exp;
    if (typeof exp === 'number') expiresAt = exp * 1000;
  }
  const stored: StoredAccessToken = { accessToken: response.access_token, expiresAt, scope: response.scope };
  if (response.id_token) {
    stored.idToken = response.id_token;
    const exp = decodeJwtClaims(response.id_token)?.exp;
    if (typeof exp === 'number') stored.idTokenExpiresAt = exp * 1000;
  }
  return stored;
}

/**
 * The bearer a service wants from a stored token set, if still usable. `skewMs` 0 is used right
 * after a refresh, so tokens living shorter than the default skew are still handed out once.
 */
export function usableBearer(
  token: StoredAccessToken | undefined,
  bearer: 'access_token' | 'id_token' | undefined,
  now = Date.now(),
  skewMs = EXPIRY_SKEW_MS
): string | null {
  if (!token) return null;
  if (bearer === 'id_token') {
    return token.idToken && isUsable({ accessToken: token.idToken, expiresAt: token.idTokenExpiresAt }, now, skewMs) ? token.idToken : null;
  }
  return isUsable(token, now, skewMs) ? token.accessToken : null;
}

export function isUsable(token: StoredAccessToken | undefined, now = Date.now(), skewMs = EXPIRY_SKEW_MS): token is StoredAccessToken {
  return !!token && (token.expiresAt === undefined || token.expiresAt - skewMs > now);
}

/** Request parameter carrying the target resource, per the IdP's convention. */
export function audienceParams(mode: AudienceParam | undefined, resource: string | undefined): Record<string, string | undefined> {
  if (!resource || mode === 'none') return {};
  return mode === 'audience' ? { audience: resource } : { resource };
}

export function clientAuthParams(idp: IdpConfig): Record<string, string | undefined> {
  return { client_id: idp.clientId, client_secret: idp.clientSecret };
}

export async function refreshAccessToken(
  fetchImpl: FetchLike,
  metadata: AuthServerMetadata,
  idp: IdpConfig,
  refreshToken: string,
  resource: string | undefined,
  scope?: string
): Promise<TokenEndpointResponse> {
  return postForm<TokenEndpointResponse>(fetchImpl, metadata.token_endpoint, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope,
    ...clientAuthParams(idp),
    ...audienceParams(idp.audienceParam, resource),
  });
}
