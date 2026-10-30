import { createPublicKey, verify as verifySignature, type KeyObject } from 'node:crypto';
import { fetchAuthServerMetadata } from './discovery.js';
import { assertSecureUrl, type FetchLike } from './http.js';

export type JwtAlgorithm = 'RS256' | 'ES256';

export interface JwtVerifierOptions {
  /** Accepted `iss` values (Google uses both `https://accounts.google.com` and `accounts.google.com`). */
  issuers: string[];
  /** Accepted `aud` value(s); the token must name at least one. */
  audience: string | string[];
  /** JWKS location; discovered from the first issuer's metadata when omitted. */
  jwksUri?: string;
  /** Default `['RS256', 'ES256']`. Symmetric and `none` algorithms are never accepted. */
  algorithms?: JwtAlgorithm[];
  /** Allowed clock skew for exp/nbf/iat, default 60 s. */
  clockToleranceSec?: number;
  /** Reject tokens whose `email_verified` claim is not true (when an email claim is present). */
  requireVerifiedEmail?: boolean;
  fetchImpl?: FetchLike;
  now?: () => number;
}

export interface VerifiedJwt {
  issuer: string;
  subject: string;
  email?: string;
  claims: Record<string, any>;
  header: Record<string, any>;
}

export class JwtVerificationError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'JwtVerificationError';
  }
}

interface JwksCache {
  keys: Map<string, { key: KeyObject; alg?: string; kty: string }>;
  fetchedAt: number;
  maxAgeMs: number;
}

const DEFAULT_MAX_AGE_MS = 60 * 60 * 1000;
const MIN_REFETCH_MS = 30 * 1000;

function decodeSegment(segment: string, what: string): Record<string, any> {
  try {
    const value = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  } catch {
    // fall through
  }
  throw new JwtVerificationError('malformed', `JWT ${what} is not a JSON object`);
}

function maxAgeFrom(cacheControl: string | null): number {
  const match = cacheControl?.match(/max-age=(\d+)/i);
  return match ? Math.max(Number(match[1]) * 1000, MIN_REFETCH_MS) : DEFAULT_MAX_AGE_MS;
}

/**
 * Verifies JWTs (e.g. Google id_tokens) against the issuer's JWKS: signature (RS256/ES256 only),
 * issuer, audience, expiry/not-before, and optionally a verified email. Keys are cached per the
 * JWKS Cache-Control and refetched (rate-limited) when an unknown `kid` appears after key rotation.
 */
export function createJwtVerifier(options: JwtVerifierOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const algorithms = new Set<string>(options.algorithms ?? ['RS256', 'ES256']);
  const audiences = new Set(Array.isArray(options.audience) ? options.audience : [options.audience]);
  const issuers = new Set(options.issuers);
  const tolerance = (options.clockToleranceSec ?? 60) * 1000;
  const now = options.now ?? Date.now;
  if (issuers.size === 0 || audiences.size === 0) throw new Error('createJwtVerifier needs issuers and audience');

  let jwksUri: Promise<string> | undefined;
  let cache: JwksCache | undefined;
  let inflight: Promise<JwksCache> | undefined;

  const resolveJwksUri = () =>
    (jwksUri ??= (async () => {
      if (options.jwksUri) return assertSecureUrl(options.jwksUri, 'jwks_uri').toString();
      const metadata = await fetchAuthServerMetadata(options.issuers[0], fetchImpl);
      if (!metadata.jwks_uri) throw new Error(`Issuer ${options.issuers[0]} publishes no jwks_uri`);
      return assertSecureUrl(metadata.jwks_uri, 'jwks_uri').toString();
    })().catch((err) => {
      jwksUri = undefined;
      throw err;
    }));

  const loadKeys = (): Promise<JwksCache> =>
    (inflight ??= (async () => {
      const res = await fetchImpl(await resolveJwksUri(), { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new JwtVerificationError('jwks_unavailable', `JWKS fetch failed with HTTP ${res.status}`);
      const body: any = await res.json();
      const keys = new Map<string, { key: KeyObject; alg?: string; kty: string }>();
      for (const jwk of Array.isArray(body?.keys) ? body.keys : []) {
        if (!jwk?.kid || (jwk.use && jwk.use !== 'sig') || (jwk.kty !== 'RSA' && jwk.kty !== 'EC')) continue;
        try {
          keys.set(jwk.kid, { key: createPublicKey({ key: jwk, format: 'jwk' }), alg: jwk.alg, kty: jwk.kty });
        } catch {
          // skip keys node cannot import
        }
      }
      cache = { keys, fetchedAt: now(), maxAgeMs: maxAgeFrom(res.headers.get('cache-control')) };
      return cache;
    })().finally(() => {
      inflight = undefined;
    }));

  const keyFor = async (kid: string) => {
    if (!cache || now() - cache.fetchedAt > cache.maxAgeMs) await loadKeys();
    let entry = cache!.keys.get(kid);
    if (!entry && now() - cache!.fetchedAt > MIN_REFETCH_MS) {
      // Key rotation: the issuer may have published a new key since the last fetch.
      await loadKeys();
      entry = cache!.keys.get(kid);
    }
    return entry;
  };

  return {
    async verify(token: string): Promise<VerifiedJwt> {
      const parts = typeof token === 'string' ? token.split('.') : [];
      if (parts.length !== 3) throw new JwtVerificationError('malformed', 'Not a JWT');
      const header = decodeSegment(parts[0], 'header');
      const claims = decodeSegment(parts[1], 'payload');

      if (!algorithms.has(header.alg)) throw new JwtVerificationError('unsupported_alg', `Algorithm ${header.alg} is not accepted`);
      if (typeof header.kid !== 'string') throw new JwtVerificationError('malformed', 'JWT header has no kid');
      const entry = await keyFor(header.kid);
      if (!entry) throw new JwtVerificationError('unknown_key', `No signing key ${header.kid}`);
      if ((entry.alg && entry.alg !== header.alg) || (header.alg === 'RS256') !== (entry.kty === 'RSA')) {
        throw new JwtVerificationError('unsupported_alg', `Key ${header.kid} does not match algorithm ${header.alg}`);
      }

      const data = Buffer.from(`${parts[0]}.${parts[1]}`);
      const signature = Buffer.from(parts[2], 'base64url');
      const valid =
        header.alg === 'ES256'
          ? verifySignature('sha256', data, { key: entry.key, dsaEncoding: 'ieee-p1363' }, signature)
          : verifySignature('sha256', data, entry.key, signature);
      if (!valid) throw new JwtVerificationError('bad_signature', 'JWT signature is invalid');

      if (!issuers.has(claims.iss)) throw new JwtVerificationError('bad_issuer', `Issuer ${claims.iss} is not accepted`);
      const tokenAudiences: unknown[] = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
      if (!tokenAudiences.some((a) => typeof a === 'string' && audiences.has(a))) {
        throw new JwtVerificationError('bad_audience', 'JWT audience is not accepted');
      }
      const t = now();
      if (typeof claims.exp !== 'number' || claims.exp * 1000 + tolerance <= t) {
        throw new JwtVerificationError('expired', 'JWT is expired');
      }
      if (typeof claims.nbf === 'number' && claims.nbf * 1000 - tolerance > t) {
        throw new JwtVerificationError('not_yet_valid', 'JWT is not valid yet');
      }
      if (typeof claims.iat === 'number' && claims.iat * 1000 - tolerance > t) {
        throw new JwtVerificationError('not_yet_valid', 'JWT was issued in the future');
      }
      if (typeof claims.sub !== 'string' || !claims.sub) throw new JwtVerificationError('malformed', 'JWT has no subject');
      if (options.requireVerifiedEmail && claims.email !== undefined && claims.email_verified !== true && claims.email_verified !== 'true') {
        throw new JwtVerificationError('unverified_email', 'Email address is not verified');
      }

      return {
        issuer: claims.iss,
        subject: claims.sub,
        email: typeof claims.email === 'string' ? claims.email : undefined,
        claims,
        header,
      };
    },
  };
}

/** Verifier preset for Google id_tokens issued to one of our OAuth clients (e.g. web and device). */
export function createGoogleIdTokenVerifier(clientIds: string | string[], extra: Partial<JwtVerifierOptions> = {}) {
  return createJwtVerifier({
    issuers: ['https://accounts.google.com', 'accounts.google.com'],
    audience: clientIds,
    jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
    requireVerifiedEmail: true,
    ...extra,
  });
}
