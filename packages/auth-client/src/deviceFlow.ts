import { AuthConfigError, OAuthError } from './errors.js';
import { postForm, sleep, type FetchLike } from './http.js';
import { audienceParams, clientAuthParams } from './tokens.js';
import type { AuthPrompt, AuthServerMetadata, IdpConfig, TokenEndpointResponse } from './types.js';

export const DEVICE_CODE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';
export const DEFAULT_SCOPE = 'openid profile email offline_access';

interface DeviceAuthorizationResponse {
  device_code: string;
  user_code: string;
  verification_uri?: string;
  /** Google's pre-RFC spelling. */
  verification_url?: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval?: number;
}

export interface DeviceFlowRequest {
  idpName: string;
  idp: IdpConfig;
  metadata: AuthServerMetadata;
  prompt: AuthPrompt;
  resource?: string;
  scope?: string;
  service?: string;
  fetchImpl?: FetchLike;
  /** Overrides the server poll interval (tests). */
  pollIntervalMs?: number;
  /** Interval increase on `slow_down`; RFC 8628 mandates 5s (tests override). */
  slowDownIncrementMs?: number;
}

/**
 * RFC 8628 device authorization grant: request a user code, show the verification
 * link through the prompt, then poll the token endpoint until the user finishes in
 * the browser, declines, or the code expires.
 */
export async function runDeviceFlow(request: DeviceFlowRequest): Promise<TokenEndpointResponse> {
  const { idp, metadata, prompt } = request;
  const fetchImpl = request.fetchImpl ?? fetch;
  if (!metadata.device_authorization_endpoint) {
    throw new AuthConfigError(`IdP ${metadata.issuer} does not support the device authorization grant`);
  }

  const resourceParams = audienceParams(idp.audienceParam, request.resource);
  const device = await postForm<DeviceAuthorizationResponse>(fetchImpl, metadata.device_authorization_endpoint, {
    scope: request.scope ?? idp.scope ?? DEFAULT_SCOPE,
    ...clientAuthParams(idp),
    ...resourceParams,
  });
  const verificationUri = device.verification_uri ?? device.verification_url;
  if (!device.device_code || !device.user_code || !verificationUri) {
    throw new OAuthError('invalid_response', 'Device authorization response is missing required fields');
  }

  prompt.showVerification({
    idp: request.idpName,
    issuer: metadata.issuer,
    service: request.service,
    verificationUri,
    verificationUriComplete: device.verification_uri_complete,
    userCode: device.user_code,
    expiresIn: device.expires_in,
  });

  let intervalMs = request.pollIntervalMs ?? Math.max(device.interval ?? 5, 1) * 1000;
  const deadline = Date.now() + device.expires_in * 1000;

  while (Date.now() < deadline) {
    await sleep(intervalMs, prompt.signal);
    try {
      return await postForm<TokenEndpointResponse>(fetchImpl, metadata.token_endpoint, {
        grant_type: DEVICE_CODE_GRANT,
        device_code: device.device_code,
        ...clientAuthParams(idp),
        ...resourceParams,
      });
    } catch (err) {
      if (!(err instanceof OAuthError)) throw err;
      if (err.code === 'authorization_pending') continue;
      if (err.code === 'slow_down') {
        intervalMs += request.slowDownIncrementMs ?? 5000;
        prompt.status?.('IdP asked to slow down polling');
        continue;
      }
      // access_denied, expired_token, invalid_grant, ...
      throw err;
    }
  }
  throw new OAuthError('expired_token', 'Device code expired before the login was completed');
}
