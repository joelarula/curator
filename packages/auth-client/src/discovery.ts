import { AuthConfigError } from './errors.js';
import { assertSecureUrl, getJson, type FetchLike } from './http.js';
import type { AuthServerMetadata, ProtectedResourceMetadata } from './types.js';

const trimSlash = (value: string) => value.replace(/\/+$/, '');

/**
 * Fetches authorization server metadata: OIDC discovery first, then RFC 8414
 * (path-inserted well-known). The returned `issuer` must match the requested one.
 */
export async function fetchAuthServerMetadata(issuer: string, fetchImpl: FetchLike = fetch): Promise<AuthServerMetadata> {
  const url = assertSecureUrl(issuer, 'Issuer');
  const path = trimSlash(url.pathname);
  const candidates = [
    `${trimSlash(issuer)}/.well-known/openid-configuration`,
    `${url.origin}/.well-known/oauth-authorization-server${path}`,
  ];

  for (const candidate of candidates) {
    const { body } = await getJson<AuthServerMetadata>(fetchImpl, candidate);
    if (!body) continue;
    if (trimSlash(String(body.issuer)) !== trimSlash(issuer)) {
      throw new AuthConfigError(`Issuer mismatch at ${candidate}: expected ${issuer}, got ${body.issuer}`);
    }
    if (!body.token_endpoint) {
      throw new AuthConfigError(`Metadata for ${issuer} has no token_endpoint`);
    }
    assertSecureUrl(body.token_endpoint, 'token_endpoint');
    if (body.device_authorization_endpoint) {
      assertSecureUrl(body.device_authorization_endpoint, 'device_authorization_endpoint');
    }
    return body;
  }
  throw new AuthConfigError(`No authorization server metadata found for issuer ${issuer}`);
}

/** Parses `WWW-Authenticate: Bearer k="v", ...` parameters (RFC 6750 / RFC 9728). */
export function parseWwwAuthenticate(header: string | null | undefined): Record<string, string> {
  const params: Record<string, string> = {};
  if (!header) return params;
  const bearer = header.match(/Bearer\s+(.*)$/i);
  if (!bearer) return params;
  const pattern = /([a-zA-Z_][\w-]*)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^\s,]+))/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(bearer[1])) !== null) {
    params[match[1].toLowerCase()] = match[2] !== undefined ? match[2].replace(/\\(.)/g, '$1') : match[3];
  }
  return params;
}

/**
 * Fetches RFC 9728 protected resource metadata for a service URL, either from the
 * `resource_metadata` URL a 401 pointed at or from the well-known locations.
 * The advertised `resource` must cover the service URL, so a server cannot claim
 * another origin's audience.
 */
export async function fetchProtectedResourceMetadata(
  serviceUrl: string,
  options: { metadataUrl?: string; fetchImpl?: FetchLike } = {}
): Promise<ProtectedResourceMetadata> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const service = assertSecureUrl(serviceUrl, 'Service URL');
  const path = trimSlash(service.pathname);
  const candidates = options.metadataUrl
    ? [assertSecureUrl(options.metadataUrl, 'resource_metadata').toString()]
    : [
        `${service.origin}/.well-known/oauth-protected-resource${path}`,
        ...(path ? [`${service.origin}/.well-known/oauth-protected-resource`] : []),
      ];

  for (const candidate of candidates) {
    const { body } = await getJson<ProtectedResourceMetadata>(fetchImpl, candidate);
    if (!body?.resource) continue;
    const resource = assertSecureUrl(body.resource, 'resource');
    const resourcePath = trimSlash(resource.pathname);
    if (resource.origin !== service.origin || !(path === resourcePath || path.startsWith(`${resourcePath}/`))) {
      throw new AuthConfigError(`Protected resource metadata at ${candidate} claims ${body.resource}, which does not cover ${serviceUrl}`);
    }
    return body;
  }
  throw new AuthConfigError(`No protected resource metadata found for ${serviceUrl}`);
}
