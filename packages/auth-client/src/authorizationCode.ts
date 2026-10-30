import { createHash, randomBytes } from 'node:crypto';
import { DEFAULT_SCOPE } from './deviceFlow.js';
import { AuthConfigError, OAuthError } from './errors.js';
import { assertSecureUrl, postForm, type FetchLike } from './http.js';
import { audienceParams, clientAuthParams } from './tokens.js';
import type { AuthPrompt, AuthServerMetadata, IdpConfig, TokenEndpointResponse } from './types.js';

/** Parameters the flow owns; `authorizationParams` from config can never override them. */
const PROTECTED_PARAMS = ['response_type', 'client_id', 'redirect_uri', 'state', 'code_challenge', 'code_challenge_method', 'scope'];

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export interface AuthorizationCodeRequest {
  idpName: string;
  /** IdP config with the effective (static or registered) clientId. */
  idp: IdpConfig & { clientId: string };
  metadata: AuthServerMetadata;
  prompt: AuthPrompt;
  redirectUri: string;
  /** Resolves with the callback query once the user returns (loopback listener or app route). */
  waitForCallback(state: string): Promise<URLSearchParams>;
  resource?: string;
  scope?: string;
  service?: string;
  fetchImpl?: FetchLike;
  expiresIn?: number;
}

/**
 * OAuth 2.0 authorization code grant with PKCE (S256): the user signs in in the browser, the
 * IdP redirects back with a code bound to our `state`, and the code is exchanged with the verifier.
 */
export async function runAuthorizationCodeFlow(request: AuthorizationCodeRequest): Promise<TokenEndpointResponse> {
  const { idp, metadata, prompt } = request;
  const fetchImpl = request.fetchImpl ?? fetch;
  if (!metadata.authorization_endpoint) {
    throw new AuthConfigError(`IdP ${metadata.issuer} has no authorization_endpoint`);
  }
  assertSecureUrl(metadata.authorization_endpoint, 'authorization_endpoint');
  const methods = metadata.code_challenge_methods_supported;
  if (methods && !methods.includes('S256')) {
    throw new AuthConfigError(`IdP ${metadata.issuer} does not support PKCE S256`);
  }

  const { verifier, challenge } = createPkcePair();
  const state = randomBytes(24).toString('base64url');
  const resourceParams = audienceParams(idp.audienceParam, request.resource);

  const url = new URL(metadata.authorization_endpoint);
  for (const [key, value] of Object.entries(idp.authorizationParams ?? {})) {
    if (!PROTECTED_PARAMS.includes(key)) url.searchParams.set(key, value);
  }
  for (const [key, value] of Object.entries({
    response_type: 'code',
    client_id: idp.clientId,
    redirect_uri: request.redirectUri,
    scope: request.scope ?? idp.scope ?? DEFAULT_SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    ...resourceParams,
  })) {
    if (value !== undefined) url.searchParams.set(key, value);
  }

  // Start waiting before the link is shown so a fast redirect cannot be missed.
  const callback = request.waitForCallback(state);
  const info = {
    idp: request.idpName,
    issuer: metadata.issuer,
    service: request.service,
    authorizationUrl: url.toString(),
    redirectUri: request.redirectUri,
    expiresIn: request.expiresIn ?? 600,
  };
  if (prompt.showAuthorization) prompt.showAuthorization(info);
  else prompt.status?.(`Open to sign in to ${request.idpName}: ${info.authorizationUrl}`);

  const params = await callback;
  const error = params.get('error');
  if (error) throw new OAuthError(error, params.get('error_description') ?? undefined);
  // RFC 9207: reject responses from a different issuer (mix-up attack).
  const iss = params.get('iss');
  if ((metadata.authorization_response_iss_parameter_supported || iss) && iss !== null && iss !== metadata.issuer) {
    throw new OAuthError('invalid_issuer', `Authorization response issuer ${iss} does not match ${metadata.issuer}`);
  }
  if (metadata.authorization_response_iss_parameter_supported && iss === null) {
    throw new OAuthError('invalid_issuer', 'Authorization response is missing the iss parameter');
  }
  const code = params.get('code');
  if (!code) throw new OAuthError('invalid_response', 'Authorization response has no code');

  return postForm<TokenEndpointResponse>(fetchImpl, metadata.token_endpoint, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: request.redirectUri,
    code_verifier: verifier,
    ...clientAuthParams(idp),
    ...resourceParams,
  });
}
