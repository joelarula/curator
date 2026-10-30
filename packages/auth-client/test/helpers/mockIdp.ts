import { createHash } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

export interface MockIdpOptions {
  clientId: string;
  /** authorization_pending responses before an approved code is issued. */
  pendingPolls?: number;
  slowDownOnce?: boolean;
  deviceGrant?: boolean;
  /** Path appended to the origin to form the issuer (e.g. `/realms/main`). */
  issuerPath?: string;
  /** Overrides the issuer advertised in metadata (mismatch tests). */
  advertisedIssuer?: string;
  accessTokenTtl?: number;
  /** id_token lifetime in seconds (default 3600). */
  idTokenTtl?: number;
  /** Advertise and send the RFC 9207 `iss` authorization response parameter. */
  issParam?: boolean;
  /** Send this `iss` in authorization responses instead of the real issuer (mix-up tests). */
  issOverride?: string;
  /** /authorize answers with error=access_denied. */
  denyAuthorize?: boolean;
  /** Offer RFC 7591 dynamic client registration. */
  registration?: boolean;
  /** Subject the /authorize step signs in as. */
  authorizeSub?: string;
}

export interface MockIdp {
  issuer: string;
  url: string;
  /** Simulates the user completing (or declining) the browser step. */
  approve(userCode: string, sub?: string): void;
  deny(userCode: string): void;
  revokeAll(): void;
  requests: { path: string; params: Record<string, string> }[];
  lastUserCode?: string;
  /** Query of every /authorize request (what the "browser" opened). */
  authorizeRequests: URLSearchParams[];
  /** Dynamically registered clients: client_id -> redirect URIs. */
  registeredClients: Map<string, string[]>;
  close(): Promise<void>;
}

const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
export const fakeJwt = (claims: object) => `${b64({ alg: 'none', typ: 'JWT' })}.${b64(claims)}.sig`;

export async function startMockIdp(options: MockIdpOptions): Promise<MockIdp> {
  const devices = new Map<string, { userCode: string; polls: number; status: 'pending' | 'approved' | 'denied'; sub?: string; resource?: string; slowed: boolean }>();
  const refreshTokens = new Map<string, string>(); // refresh token -> sub
  let counter = 0;
  const requests: MockIdp['requests'] = [];
  const authorizeRequests: URLSearchParams[] = [];
  // client_id -> allowed redirect URIs (undefined: any, for the statically configured client)
  const clients = new Map<string, string[] | undefined>([[options.clientId, undefined]]);
  const registeredClients = new Map<string, string[]>();
  const codes = new Map<string, { challenge: string; redirectUri: string; clientId: string; resource?: string; sub: string }>();

  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks).toString('utf8');
    const requestUrl = new URL(req.url!, 'http://x');
    const path = requestUrl.pathname;
    const params: Record<string, string> =
      req.method === 'GET' ? Object.fromEntries(requestUrl.searchParams) : path === '/register' ? {} : Object.fromEntries(new URLSearchParams(raw));
    requests.push({ path, params });
    const json = (status: number, body: object) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    const issuer = idp.issuer;
    const issuerPath = options.issuerPath ?? '';
    if (req.method === 'GET' && path === `${issuerPath}/.well-known/openid-configuration`) {
      return json(200, {
        issuer: options.advertisedIssuer ?? issuer,
        token_endpoint: `${idp.url}/token`,
        device_authorization_endpoint: options.deviceGrant === false ? undefined : `${idp.url}/device`,
        revocation_endpoint: `${idp.url}/revoke`,
        authorization_endpoint: `${idp.url}/authorize`,
        registration_endpoint: options.registration ? `${idp.url}/register` : undefined,
        code_challenge_methods_supported: ['S256'],
        authorization_response_iss_parameter_supported: options.issParam === true,
      });
    }
    if (path === '/register' && req.method === 'POST') {
      if (!options.registration) return json(404, { error: 'not_found' });
      const body = JSON.parse(raw || '{}');
      if (body.token_endpoint_auth_method !== 'none') return json(400, { error: 'invalid_client_metadata' });
      const clientId = `dyn-${++counter}`;
      clients.set(clientId, body.redirect_uris ?? []);
      registeredClients.set(clientId, body.redirect_uris ?? []);
      return json(201, { client_id: clientId, redirect_uris: body.redirect_uris ?? [] });
    }
    if (!clients.has(params.client_id)) return json(401, { error: 'invalid_client' });

    if (path === '/authorize' && req.method === 'GET') {
      authorizeRequests.push(requestUrl.searchParams);
      const allowed = clients.get(params.client_id);
      if (allowed && !allowed.includes(params.redirect_uri)) return json(400, { error: 'invalid_redirect_uri' });
      if (params.code_challenge_method !== 'S256' || !params.code_challenge) return json(400, { error: 'invalid_request' });
      const back = new URL(params.redirect_uri);
      back.searchParams.set('state', params.state);
      if (options.denyAuthorize) {
        back.searchParams.set('error', 'access_denied');
      } else {
        const code = `ac-${++counter}`;
        codes.set(code, {
          challenge: params.code_challenge,
          redirectUri: params.redirect_uri,
          clientId: params.client_id,
          resource: params.resource ?? params.audience,
          sub: options.authorizeSub ?? 'alice',
        });
        back.searchParams.set('code', code);
      }
      if (options.issOverride || options.issParam) back.searchParams.set('iss', options.issOverride ?? issuer);
      res.writeHead(302, { Location: back.toString() }).end();
      return;
    }

    const issueTokens = (sub: string, resource?: string) => {
      const refresh = `rt-${++counter}`;
      refreshTokens.set(refresh, sub);
      return {
        access_token: fakeJwt({ iss: issuer, sub, aud: resource ?? options.clientId, n: counter }),
        token_type: 'Bearer',
        expires_in: options.accessTokenTtl ?? 300,
        refresh_token: refresh,
        id_token: fakeJwt({ iss: issuer, sub, aud: params.client_id, email: `${sub}@example.test`, n: counter, exp: Math.floor(Date.now() / 1000) + (options.idTokenTtl ?? 3600) }),
      };
    };

    if (path === '/device') {
      const deviceCode = `dc-${++counter}`;
      const userCode = `UC-${counter}`;
      devices.set(deviceCode, { userCode, polls: 0, status: 'pending', resource: params.resource ?? params.audience, slowed: false });
      idp.lastUserCode = userCode;
      return json(200, {
        device_code: deviceCode,
        user_code: userCode,
        verification_uri: `${idp.url}/activate`,
        verification_uri_complete: `${idp.url}/activate?user_code=${userCode}`,
        expires_in: 600,
        interval: 1,
      });
    }
    if (path === '/token' && params.grant_type === 'urn:ietf:params:oauth:grant-type:device_code') {
      const device = devices.get(params.device_code);
      if (!device) return json(400, { error: 'invalid_grant' });
      device.polls++;
      if (options.slowDownOnce && !device.slowed) {
        device.slowed = true;
        return json(400, { error: 'slow_down' });
      }
      if (device.status === 'denied') return json(400, { error: 'access_denied' });
      if (device.status === 'pending' || device.polls <= (options.pendingPolls ?? 0)) {
        return json(400, { error: 'authorization_pending' });
      }
      devices.delete(params.device_code);
      return json(200, issueTokens(device.sub!, device.resource));
    }
    if (path === '/token' && params.grant_type === 'authorization_code') {
      const grant = codes.get(params.code);
      codes.delete(params.code);
      const verified = grant && createHash('sha256').update(params.code_verifier ?? '').digest('base64url') === grant.challenge;
      if (!grant || !verified || grant.clientId !== params.client_id || grant.redirectUri !== params.redirect_uri) {
        return json(400, { error: 'invalid_grant' });
      }
      return json(200, issueTokens(grant.sub, grant.resource));
    }
    if (path === '/token' && params.grant_type === 'refresh_token') {
      const sub = refreshTokens.get(params.refresh_token);
      if (!sub) return json(400, { error: 'invalid_grant' });
      refreshTokens.delete(params.refresh_token); // rotation: each refresh token is single-use
      return json(200, issueTokens(sub, params.resource ?? params.audience));
    }
    if (path === '/revoke') {
      refreshTokens.delete(params.token);
      return json(200, {});
    }
    json(404, { error: 'not_found' });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const idp: MockIdp = {
    url,
    issuer: `${url}${options.issuerPath ?? ''}`,
    requests,
    authorizeRequests,
    registeredClients,
    approve(userCode, sub = 'alice') {
      for (const device of devices.values()) {
        if (device.userCode === userCode) Object.assign(device, { status: 'approved', sub });
      }
    },
    deny(userCode) {
      for (const device of devices.values()) {
        if (device.userCode === userCode) device.status = 'denied';
      }
    },
    revokeAll() {
      refreshTokens.clear();
    },
    close: () => new Promise((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
  return idp;
}

/** Protected resource (e.g. a remote MCP server) advertising its IdP per RFC 9728 and checking bearer audience. */
export async function startMockResource(options: { authorizationServers: () => string[]; path?: string; claimedResource?: string }) {
  const path = options.path ?? '/mcp';
  let accepted = 0;
  const server = http.createServer((req, res) => {
    const reqPath = new URL(req.url!, 'http://x').pathname;
    const resource = options.claimedResource ?? `${url}${path}`;
    if (reqPath === `/.well-known/oauth-protected-resource${path}`) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ resource, authorization_servers: options.authorizationServers() }));
    }
    const token = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
    let claims: any = {};
    try {
      claims = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString());
    } catch {
      // malformed or foreign token: treated as unauthenticated
    }
    if (claims.aud !== `${url}${path}`) {
      res.writeHead(401, { 'WWW-Authenticate': `Bearer resource_metadata="${url}/.well-known/oauth-protected-resource${path}"` });
      return res.end();
    }
    accepted++;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, sub: claims.sub }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    url: `${url}${path}`,
    get accepted() {
      return accepted;
    },
    close: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}

/** Prompt that approves the code as soon as it is shown, like a user finishing in the browser. */
export function autoApprovePrompt(idp: MockIdp, sub = 'alice', shown: any[] = []) {
  return {
    shown,
    showVerification(info: any) {
      shown.push(info);
      idp.approve(info.userCode, sub);
    },
  };
}
