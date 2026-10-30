import { loadAuthConfig, validateAuthConfig } from './config.js';
import { runAuthorizationCodeFlow } from './authorizationCode.js';
import { DEFAULT_SCOPE, runDeviceFlow } from './deviceFlow.js';
import { fetchAuthServerMetadata, fetchProtectedResourceMetadata, parseWwwAuthenticate } from './discovery.js';
import { AuthConfigError, OAuthError } from './errors.js';
import { postForm, type FetchLike } from './http.js';
import { RedirectRegistry, isLoopbackRedirect, startLoopbackListener, type LoopbackListener } from './redirect.js';
import { registerClient } from './registration.js';
import { FileTokenStore } from './tokenStore.js';
import {
  clientAuthParams,
  decodeJwtClaims,
  identityFromIdToken,
  isUsable,
  refreshAccessToken,
  toStoredAccessToken,
  usableBearer,
} from './tokens.js';
import type {
  AuthConfig,
  AuthIdentity,
  AuthPrompt,
  AuthServerMetadata,
  CuratorAuthProvider,
  IdpConfig,
  LoginFlow,
  ServiceConfig,
  StoredRegistration,
  StoredSession,
  TokenEndpointResponse,
  TokenStore,
} from './types.js';

export interface AuthSessionManagerOptions {
  config?: AuthConfig;
  store?: TokenStore;
  fetchImpl?: FetchLike;
  /** Device-flow timing overrides (tests). */
  deviceFlow?: { pollIntervalMs?: number; slowDownIncrementMs?: number };
  /**
   * Where authorization-code callbacks arrive. `loopback` (default, CLI/REPL): a temporary
   * 127.0.0.1 listener. `external` (web apps): the app routes its callback URL to `handleRedirect`.
   */
  redirectMode?: 'loopback' | 'external';
  /** How long an interactive authorization-code login may take (default 10 min). */
  loginTimeoutMs?: number;
}

/** IdP config with the client id that is actually used (static or dynamically registered). */
type EffectiveIdp = IdpConfig & { clientId: string };

export interface ResolvedService {
  name: string;
  service: ServiceConfig;
  idpName: string;
  idp: IdpConfig;
  /** Resource indicator sent to the IdP; undefined when the IdP takes no audience parameter. */
  resource?: string;
  discovered: boolean;
}

export interface AuthSessionInfo {
  idp: string;
  issuer: string;
  clientId?: string;
  loggedIn: boolean;
  identity?: AuthIdentity;
  tokens: { resource: string; expiresAt?: number; valid: boolean }[];
  services: string[];
}

const ANY_RESOURCE = '*';
const trimSlash = (value: string) => value.replace(/\/+$/, '');

/** Canonical resource URI for a service URL: ws(s) mapped to http(s), no query/fragment/trailing slash. */
export function canonicalResource(serviceUrl: string): string {
  const url = new URL(serviceUrl.replace(/^ws(s?):\/\//i, 'http$1://'));
  url.search = '';
  url.hash = '';
  return trimSlash(url.toString());
}

/**
 * Holds concurrent logins to several IdPs and hands out per-service token providers.
 * One interactive login per IdP (device flow or authorization code + PKCE); tokens for each
 * service (resource) are then minted from that session's refresh token.
 */
export class AuthSessionManager {
  private readonly config: Required<AuthConfig>;
  private readonly store: TokenStore;
  private readonly fetchImpl: FetchLike;
  private readonly metadataCache = new Map<string, Promise<AuthServerMetadata>>();
  private readonly resolved = new Map<string, Promise<ResolvedService>>();
  private readonly locks = new Map<string, Promise<unknown>>();
  private readonly redirects = new RedirectRegistry();

  constructor(private readonly options: AuthSessionManagerOptions = {}) {
    const config = options.config ?? {};
    validateAuthConfig(config);
    this.config = { idps: { ...config.idps }, services: { ...config.services } };
    this.store = options.store ?? new FileTokenStore();
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  static async fromConfigFile(file?: string, options: Omit<AuthSessionManagerOptions, 'config'> = {}): Promise<AuthSessionManager> {
    return new AuthSessionManager({ ...options, config: await loadAuthConfig(file) });
  }

  addIdp(name: string, idp: IdpConfig): this {
    this.config.idps[name] = idp;
    validateAuthConfig({ idps: { [name]: idp } });
    return this;
  }

  /** Registers a service at runtime (e.g. a remote MCP server added from the REPL). */
  addService(name: string, service: ServiceConfig): this {
    validateAuthConfig({ idps: this.config.idps, services: { [name]: service } });
    this.config.services[name] = service;
    this.resolved.delete(name);
    return this;
  }

  idpNames(): string[] {
    return Object.keys(this.config.idps);
  }

  serviceNames(): string[] {
    return Object.keys(this.config.services);
  }

  provider(serviceName: string): CuratorAuthProvider {
    if (!this.config.services[serviceName]) {
      throw new AuthConfigError(`Unknown service "${serviceName}"`);
    }
    return {
      name: serviceName,
      getAccessToken: () => this.getAccessToken(serviceName),
      login: (prompt) => this.login(serviceName, prompt),
      invalidate: () => this.invalidate(serviceName),
      handleUnauthorized: (header) => this.handleUnauthorized(serviceName, header),
      logout: () => this.logout(serviceName),
      whoami: () => this.whoami(serviceName),
    };
  }

  /** Maps a service to its IdP: explicit `idp` in config, otherwise RFC 9728 discovery. */
  resolveService(serviceName: string, options: { metadataUrl?: string; refresh?: boolean } = {}): Promise<ResolvedService> {
    if (options.refresh) this.resolved.delete(serviceName);
    let pending = this.resolved.get(serviceName);
    if (!pending) {
      pending = this.doResolveService(serviceName, options.metadataUrl);
      pending.catch(() => this.resolved.delete(serviceName));
      this.resolved.set(serviceName, pending);
    }
    return pending;
  }

  private async doResolveService(name: string, metadataUrl?: string): Promise<ResolvedService> {
    const service = this.config.services[name];
    if (!service) throw new AuthConfigError(`Unknown service "${name}"`);
    const withResource = (idp: IdpConfig, resource: string) => (idp.audienceParam === 'none' ? undefined : resource);

    if (service.idp) {
      const idp = this.config.idps[service.idp];
      return { name, service, idpName: service.idp, idp, resource: withResource(idp, service.resource ?? canonicalResource(service.url)), discovered: false };
    }

    const httpUrl = service.url.replace(/^ws(s?):\/\//i, 'http$1://');
    const prm = await fetchProtectedResourceMetadata(httpUrl, { metadataUrl, fetchImpl: this.fetchImpl });
    const issuers = (prm.authorization_servers ?? []).map(trimSlash);
    // Only IdPs the user configured (with a clientId) are used: discovery never introduces a new trust root.
    const match = Object.entries(this.config.idps).find(([, idp]) => issuers.includes(trimSlash(idp.issuer)));
    if (!match) {
      throw new AuthConfigError(
        `Service "${name}" is protected by ${issuers.join(', ') || 'an unnamed authorization server'}; add that issuer to "idps" with a clientId`
      );
    }
    const [idpName, idp] = match;
    return { name, service, idpName, idp, resource: withResource(idp, service.resource ?? prm.resource), discovered: true };
  }

  metadata(idp: IdpConfig): Promise<AuthServerMetadata> {
    const key = trimSlash(idp.issuer);
    let pending = this.metadataCache.get(key);
    if (!pending) {
      pending = fetchAuthServerMetadata(idp.issuer, this.fetchImpl);
      pending.catch(() => this.metadataCache.delete(key));
      this.metadataCache.set(key, pending);
    }
    return pending;
  }

  async getAccessToken(serviceName: string): Promise<string | null> {
    const resolved = await this.resolveService(serviceName);
    const key = sessionKey(resolved.idp);
    const resourceKey = resolved.resource ?? ANY_RESOURCE;

    return this.withLock(key, async () => {
      const session = await this.store.get(key);
      if (!session) return null;
      const bearer = resolved.service.bearer;
      const cached = usableBearer(session.accessTokens[resourceKey], bearer);
      if (cached) return cached;
      if (!session.refreshToken) return null;
      const client = effectiveIdp(resolved.idp, session.registration);
      if (!client) return null;

      let response: TokenEndpointResponse;
      try {
        response = await refreshAccessToken(this.fetchImpl, await this.metadata(resolved.idp), client, session.refreshToken, resolved.resource);
      } catch (err) {
        if (err instanceof OAuthError && err.code === 'invalid_grant') {
          // Refresh token revoked or expired: the IdP session is gone (a client registration is kept).
          if (session.registration) await this.store.set(key, emptySession(session));
          else await this.store.delete(key);
          return null;
        }
        throw err;
      }
      this.applyTokenResponse(session, client, resourceKey, response);
      await this.store.set(key, session);
      // An IdP that returns no id_token on refresh needs a new login for id_token services.
      return usableBearer(session.accessTokens[resourceKey], bearer, Date.now(), 0);
    });
  }

  /**
   * Interactive login. `target` is an IdP name or a service name; logging in through a service
   * requests a token for that service's resource and scopes. Uses the device flow or the
   * authorization code flow (PKCE) depending on the IdP's `flow` setting and capabilities.
   */
  async login(target: string, prompt: AuthPrompt): Promise<AuthIdentity> {
    let idpName: string;
    let idp: IdpConfig;
    let resource: string | undefined;
    let scope: string | undefined;
    let service: string | undefined;

    if (this.config.services[target]) {
      const resolved = await this.resolveService(target);
      ({ idpName, idp, resource } = resolved);
      service = target;
      const extra = resolved.service.scope;
      scope = extra ? `${idp.scope ?? DEFAULT_SCOPE} ${extra}` : undefined;
    } else if (this.config.idps[target]) {
      idpName = target;
      idp = this.config.idps[target];
    } else {
      throw new AuthConfigError(`"${target}" is neither a configured IdP nor a service`);
    }

    const metadata = await this.metadata(idp);
    const flow = chooseFlow(idp.flow, metadata);
    prompt.status?.(`Signing in to ${idpName} (${idp.issuer})...`);

    let response: TokenEndpointResponse;
    let client: EffectiveIdp;
    if (flow === 'device') {
      client = await this.ensureClient(idp, metadata, { grantTypes: ['urn:ietf:params:oauth:grant-type:device_code', 'refresh_token'] });
      response = await runDeviceFlow({
        idpName,
        idp: client,
        metadata,
        prompt,
        resource,
        scope,
        service,
        fetchImpl: this.fetchImpl,
        ...this.options.deviceFlow,
      });
    } else {
      const redirect = await this.openRedirect(idp);
      try {
        client = await this.ensureClient(idp, metadata, {
          grantTypes: ['authorization_code', 'refresh_token'],
          redirectUri: redirect.redirectUri,
        });
        const timeoutMs = this.options.loginTimeoutMs ?? 600_000;
        response = await runAuthorizationCodeFlow({
          idpName,
          idp: client,
          metadata,
          prompt,
          resource,
          scope,
          service,
          redirectUri: redirect.redirectUri,
          waitForCallback: (state) => this.redirects.expect(state, timeoutMs, prompt.signal),
          fetchImpl: this.fetchImpl,
          expiresIn: Math.round(timeoutMs / 1000),
        });
      } finally {
        await redirect.close();
      }
    }

    const key = sessionKey(idp);
    return this.withLock(key, async () => {
      const existing = await this.store.get(key);
      const session: StoredSession = {
        issuer: idp.issuer,
        clientId: client.clientId,
        registration: existing?.registration,
        accessTokens: {},
        updatedAt: Date.now(),
      };
      this.applyTokenResponse(session, client, resource ?? ANY_RESOURCE, response);
      // Same user (and client) signing in again keeps tokens minted for other services.
      if (existing && existing.clientId === client.clientId && existing.identity?.sub === session.identity?.sub) {
        session.accessTokens = { ...existing.accessTokens, ...session.accessTokens };
        session.refreshToken ??= existing.refreshToken;
      }
      await this.store.set(key, session);
      return session.identity!;
    });
  }

  /**
   * Delivers an authorization-code callback (redirectMode `external`). Web apps call this from
   * their callback route with the request URL; returns false for an unknown or expired `state`.
   */
  handleRedirect(callback: string | URL | URLSearchParams): boolean {
    return this.redirects.deliver(callback);
  }

  /** Signs out of the IdP behind `target` (IdP or service name), revoking the refresh token when supported. */
  async logout(target: string): Promise<void> {
    const idp = this.config.idps[target] ?? (this.config.services[target] ? (await this.resolveService(target)).idp : undefined);
    if (!idp) throw new AuthConfigError(`"${target}" is neither a configured IdP nor a service`);
    const key = sessionKey(idp);
    await this.withLock(key, async () => {
      const session = await this.store.get(key);
      await this.store.delete(key);
      const client = effectiveIdp(idp, session?.registration);
      if (!session?.refreshToken || !client) return;
      try {
        const metadata = await this.metadata(idp);
        const endpoint = metadata.revocation_endpoint;
        if (typeof endpoint === 'string') {
          await postForm(this.fetchImpl, endpoint, {
            token: session.refreshToken,
            token_type_hint: 'refresh_token',
            ...clientAuthParams(client),
          });
        }
      } catch {
        // Local sign-out already happened; revocation is best effort.
      }
    });
  }

  async whoami(target: string): Promise<AuthIdentity | null> {
    const idp = this.config.idps[target] ?? (this.config.services[target] ? (await this.resolveService(target)).idp : undefined);
    if (!idp) throw new AuthConfigError(`"${target}" is neither a configured IdP nor a service`);
    return (await this.store.get(sessionKey(idp)))?.identity ?? null;
  }

  async invalidate(serviceName: string): Promise<void> {
    const resolved = await this.resolveService(serviceName);
    const key = sessionKey(resolved.idp);
    await this.withLock(key, async () => {
      const session = await this.store.get(key);
      if (!session) return;
      delete session.accessTokens[resolved.resource ?? ANY_RESOURCE];
      await this.store.set(key, session);
    });
  }

  /**
   * Reacts to a 401: re-runs discovery when the server points at new resource metadata,
   * drops the rejected token, and reports whether a silent retry can succeed.
   */
  async handleUnauthorized(serviceName: string, wwwAuthenticate?: string | null): Promise<boolean> {
    const params = parseWwwAuthenticate(wwwAuthenticate);
    if (params.error === 'insufficient_scope') return false;
    const service = this.config.services[serviceName];
    if (params.resource_metadata && !service?.idp) {
      await this.resolveService(serviceName, { metadataUrl: params.resource_metadata, refresh: true });
    }
    await this.invalidate(serviceName);
    const resolved = await this.resolveService(serviceName);
    return !!(await this.store.get(sessionKey(resolved.idp)))?.refreshToken;
  }

  async list(now = Date.now()): Promise<AuthSessionInfo[]> {
    const servicesByIdp = new Map<string, string[]>();
    for (const name of this.serviceNames()) {
      const idpName = this.config.services[name].idp ?? (await this.resolved.get(name)?.catch(() => undefined))?.idpName;
      if (idpName) servicesByIdp.set(idpName, [...(servicesByIdp.get(idpName) ?? []), name]);
    }
    const infos: AuthSessionInfo[] = [];
    for (const [name, idp] of Object.entries(this.config.idps)) {
      const session = await this.store.get(sessionKey(idp));
      infos.push({
        idp: name,
        issuer: idp.issuer,
        clientId: idp.clientId ?? session?.registration?.clientId,
        loggedIn: !!session && (!!session.refreshToken || Object.values(session.accessTokens).some((t) => isUsable(t, now))),
        identity: session?.identity,
        tokens: Object.entries(session?.accessTokens ?? {}).map(([resource, token]) => ({
          resource,
          expiresAt: token.expiresAt,
          valid: isUsable(token, now),
        })),
        services: servicesByIdp.get(name) ?? [],
      });
    }
    return infos;
  }

  /**
   * Static clientId, or the stored dynamic registration when it covers `redirectUri`; otherwise
   * registers a new public client (RFC 7591) and stores it with the IdP session.
   */
  private async ensureClient(
    idp: IdpConfig,
    metadata: AuthServerMetadata,
    opts: { grantTypes: string[]; redirectUri?: string }
  ): Promise<EffectiveIdp> {
    if (idp.clientId) return idp as EffectiveIdp;
    const key = sessionKey(idp);
    return this.withLock(key, async () => {
      const existing = await this.store.get(key);
      const stored = existing?.registration;
      if (stored && (!opts.redirectUri || stored.redirectUris.includes(opts.redirectUri))) {
        return effectiveIdp(idp, stored)!;
      }
      const registration = await registerClient(this.fetchImpl, metadata, {
        redirectUris: opts.redirectUri ? [opts.redirectUri] : [],
        grantTypes: opts.grantTypes,
        clientName: idp.clientName,
        scope: idp.scope ?? DEFAULT_SCOPE,
      });
      // Tokens of a previous registration belong to another client: start a fresh session record.
      await this.store.set(key, { ...emptySession({ issuer: idp.issuer }), clientId: registration.clientId, registration });
      return effectiveIdp(idp, registration)!;
    });
  }

  /**
   * Redirect target for an authorization-code login: the configured URI (external mode) or a
   * loopback listener, reusing a dynamically registered loopback URI so the client stays valid.
   */
  private async openRedirect(idp: IdpConfig): Promise<{ redirectUri: string; close(): Promise<void> }> {
    if (this.options.redirectMode === 'external') {
      if (!idp.redirectUri) throw new AuthConfigError(`IdP ${idp.issuer} needs a redirectUri for external redirect handling`);
      return { redirectUri: idp.redirectUri, close: async () => {} };
    }
    if (idp.redirectUri && !isLoopbackRedirect(idp.redirectUri)) {
      throw new AuthConfigError(`redirectUri ${idp.redirectUri} is not a loopback address; use redirectMode "external" for web apps`);
    }
    const remembered = idp.clientId
      ? undefined
      : (await this.store.get(sessionKey(idp)))?.registration?.redirectUris.find(isLoopbackRedirect);
    const preferred = idp.redirectUri ?? remembered;
    try {
      return await startLoopbackListener(this.redirects, preferred);
    } catch (err) {
      // A remembered port may be taken: a fresh port means a fresh registration. Static URIs must bind.
      if (idp.redirectUri || !remembered) throw err;
      return startLoopbackListener(this.redirects);
    }
  }

  private applyTokenResponse(session: StoredSession, idp: EffectiveIdp, resourceKey: string, response: TokenEndpointResponse): void {
    session.accessTokens[resourceKey] = toStoredAccessToken(response);
    if (response.refresh_token) session.refreshToken = response.refresh_token;
    const identity = identityFromIdToken(response.id_token, idp.issuer, idp.clientId);
    if (identity) {
      session.identity = identity;
    } else if (!session.identity) {
      // No id_token (non-OIDC IdP): best-effort, unverified subject for display only.
      const claims = decodeJwtClaims(response.access_token);
      session.identity = { issuer: idp.issuer, sub: String(claims?.sub ?? 'unknown'), email: claims?.email, name: claims?.name };
    }
    session.updatedAt = Date.now();
  }

  /** Serializes work per IdP session so concurrent refreshes cannot race on a rotating refresh token. */
  private withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    const run = previous.then(fn, fn);
    const tail = run.catch(() => undefined);
    this.locks.set(key, tail);
    tail.then(() => {
      if (this.locks.get(key) === tail) this.locks.delete(key);
    });
    return run;
  }
}

/** Store key of an IdP session; dynamically registered clients share one key per issuer. */
export function sessionKey(idp: IdpConfig): string {
  return `${trimSlash(idp.issuer)}#${idp.clientId ?? 'dynamic'}`;
}

function effectiveIdp(idp: IdpConfig, registration?: StoredRegistration): EffectiveIdp | null {
  if (idp.clientId) return idp as EffectiveIdp;
  if (!registration) return null;
  return { ...idp, clientId: registration.clientId, clientSecret: registration.clientSecret };
}

function chooseFlow(flow: LoginFlow | undefined, metadata: AuthServerMetadata): 'device' | 'authorization_code' {
  if (flow === 'device' || flow === 'authorization_code') return flow;
  return metadata.device_authorization_endpoint ? 'device' : 'authorization_code';
}

/** Session record without tokens or identity (keeps the client registration). */
function emptySession(session: Pick<StoredSession, 'issuer'> & Partial<StoredSession>): StoredSession {
  return {
    issuer: session.issuer,
    clientId: session.clientId ?? session.registration?.clientId ?? '',
    registration: session.registration,
    accessTokens: {},
    updatedAt: Date.now(),
  };
}
