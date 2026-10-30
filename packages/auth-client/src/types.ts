/**
 * A token source bound to one service (one IdP + one resource).
 * Channels, MCP transports and `authFetch` depend only on this interface.
 */
export interface CuratorAuthProvider {
  /** Service name this provider is bound to. */
  readonly name: string;
  /** Returns a valid access token, refreshing silently if possible; null when an interactive login is needed. */
  getAccessToken(): Promise<string | null>;
  /** Interactive login (device flow); progress is reported through the prompt. */
  login(prompt: AuthPrompt): Promise<AuthIdentity>;
  /** Drops the cached access token for this service so the next call refreshes. */
  invalidate(): Promise<void>;
  /**
   * Handles a 401 from the service. Returns true when a retry may succeed
   * (token refreshed or discovery updated from `WWW-Authenticate`).
   */
  handleUnauthorized(wwwAuthenticate?: string | null): Promise<boolean>;
  logout(): Promise<void>;
  whoami(): Promise<AuthIdentity | null>;
}

export interface VerificationInfo {
  /** IdP name (config key) or issuer URL when discovered. */
  idp: string;
  issuer: string;
  /** Service the login was started for, if any. */
  service?: string;
  verificationUri: string;
  verificationUriComplete?: string;
  userCode: string;
  expiresIn: number;
}

export interface AuthorizationInfo {
  idp: string;
  issuer: string;
  service?: string;
  /** URL the user opens to sign in; the IdP redirects back to the app or loopback listener. */
  authorizationUrl: string;
  redirectUri: string;
  expiresIn: number;
}

/** How an auth flow talks to the user; REPLs and web apps supply their own implementation. */
export interface AuthPrompt {
  /** Device flow: show link + user code. */
  showVerification(info: VerificationInfo): void;
  /** Authorization code flow: open or show the sign-in URL. Falls back to `status` when absent. */
  showAuthorization?(info: AuthorizationInfo): void;
  status?(message: string): void;
  /** Aborts polling (e.g. Ctrl+C). */
  signal?: AbortSignal;
}

export interface AuthIdentity {
  issuer: string;
  sub: string;
  email?: string;
  name?: string;
  /** Epoch ms of the refresh-capable session, when known. */
  expiresAt?: number;
}

/** How the target resource is communicated to the IdP. */
export type AudienceParam = 'resource' | 'audience' | 'none';

/** Interactive login grant. `auto`: device flow when the IdP offers it, else authorization code + PKCE. */
export type LoginFlow = 'device' | 'authorization_code' | 'auto';

export interface IdpConfig {
  issuer: string;
  /** Registered client id. Omit together with `registration: 'dynamic'` to register via RFC 7591. */
  clientId?: string;
  /** Only for confidential clients; public clients omit it. */
  clientSecret?: string;
  /** Default: `openid profile email offline_access`. */
  scope?: string;
  /** Default: `resource` (RFC 8707). Auth0-style IdPs use `audience`; Keycloak typically `none`. */
  audienceParam?: AudienceParam;
  /** Default `auto`. Google needs `authorization_code`: its device flow excludes Gmail/Calendar scopes. */
  flow?: LoginFlow;
  /**
   * Redirect URI for the authorization code flow. Defaults to a loopback listener
   * (`http://127.0.0.1:<port>/callback`); web apps set their own callback route.
   */
  redirectUri?: string;
  /** Extra authorization request parameters, e.g. Google's `{ access_type: 'offline', prompt: 'consent' }`. */
  authorizationParams?: Record<string, string>;
  /** `dynamic`: register a public client at the IdP's registration endpoint when no clientId is set. */
  registration?: 'static' | 'dynamic';
  /** Client name sent during dynamic registration. */
  clientName?: string;
}

export interface ServiceConfig {
  url: string;
  kind?: 'curator' | 'mcp' | 'http';
  /** IdP config key. When omitted, the IdP is discovered via RFC 9728 protected resource metadata. */
  idp?: string;
  /** Resource indicator / audience; defaults to the discovered `resource` or the service origin. */
  resource?: string;
  /** Extra scopes requested for this service's tokens. */
  scope?: string;
  /**
   * Token sent as `Authorization: Bearer`. `id_token` for resource servers that verify the IdP's
   * signed identity token via JWKS (e.g. Google, whose access tokens are opaque). Default `access_token`.
   */
  bearer?: 'access_token' | 'id_token';
}

export interface AuthConfig {
  idps?: Record<string, IdpConfig>;
  services?: Record<string, ServiceConfig>;
}

/** RFC 8414 / OIDC discovery document (subset). */
export interface AuthServerMetadata {
  issuer: string;
  token_endpoint: string;
  device_authorization_endpoint?: string;
  authorization_endpoint?: string;
  registration_endpoint?: string;
  code_challenge_methods_supported?: string[];
  authorization_response_iss_parameter_supported?: boolean;
  jwks_uri?: string;
  grant_types_supported?: string[];
  [key: string]: unknown;
}

/** RFC 9728 protected resource metadata (subset). */
export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers?: string[];
  scopes_supported?: string[];
  [key: string]: unknown;
}

export interface TokenEndpointResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
}

export interface StoredAccessToken {
  accessToken: string;
  /** Epoch ms; undefined when the IdP did not say. */
  expiresAt?: number;
  scope?: string;
  /** id_token from the same token response, for services with `bearer: 'id_token'`. */
  idToken?: string;
  idTokenExpiresAt?: number;
}

/** Everything persisted for one (issuer, clientId) login. */
export interface StoredSession {
  issuer: string;
  clientId: string;
  /** Present when the client was registered dynamically for this session's IdP. */
  registration?: StoredRegistration;
  identity?: AuthIdentity;
  refreshToken?: string;
  /** Keyed by resource indicator, or `*` when the IdP has no resource/audience parameter. */
  accessTokens: Record<string, StoredAccessToken>;
  updatedAt: number;
}

/** A client registered dynamically (RFC 7591), stored per issuer. */
export interface StoredRegistration {
  issuer: string;
  clientId: string;
  clientSecret?: string;
  redirectUris: string[];
  registeredAt: number;
}

export interface TokenStore {
  get(key: string): Promise<StoredSession | null>;
  set(key: string, session: StoredSession): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}
