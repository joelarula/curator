# @curator/auth-client

OAuth 2.0 / OIDC client sessions for Curator REPL clients. No runtime dependencies.

- **Device flow** (RFC 8628): login prints a link + code; authentication happens in the browser.
- **Multiple concurrent sessions**: one login per IdP (`issuer + clientId`), many services per IdP.
- **Per-service tokens**: access tokens are minted per resource (RFC 8707 `resource`, or `audience`) from the IdP session's refresh token.
- **Discovery**: a service without `idp` is mapped to its IdP via RFC 9728 protected resource metadata (how remote MCP servers advertise their authorization server). Only issuers listed in `idps` are ever used.

## Config — `~/.curator/auth.json` (override: `CURATOR_AUTH_CONFIG`)

```json
{
  "idps": {
    "corp":    { "issuer": "https://kc.corp/realms/main", "clientId": "curator-cli", "audienceParam": "none" },
    "partner": { "issuer": "https://auth.partner.io/", "clientId": "7f3a...", "audienceParam": "audience" }
  },
  "services": {
    "curator":  { "url": "wss://curator.corp/api/events", "idp": "corp" },
    "crm-mcp":  { "url": "https://crm.corp/mcp", "kind": "mcp", "idp": "corp" },
    "docs-mcp": { "url": "https://mcp.partner.io/mcp", "kind": "mcp" }
  }
}
```

`audienceParam`: `resource` (default, RFC 8707), `audience` (Auth0-style), `none` (one token for all services of that IdP, e.g. Keycloak with audience mappers).

### Login flows

`flow`: `auto` (default: device flow when the IdP offers it, otherwise authorization code), `device`, or `authorization_code` (PKCE S256, RFC 9207 `iss` check). The browser returns to:

- a temporary loopback listener `http://127.0.0.1:<port>/callback` (CLI/REPL; set `redirectUri` to pin host/port/path), or
- the app's own route when the manager is created with `redirectMode: 'external'`; the route calls `auth.handleRedirect(req.url)`.

```json
"google": {
  "issuer": "https://accounts.google.com",
  "clientId": "....apps.googleusercontent.com",
  "clientSecret": "...",
  "flow": "authorization_code",
  "scope": "openid email https://www.googleapis.com/auth/gmail.readonly",
  "audienceParam": "none",
  "authorizationParams": { "access_type": "offline", "prompt": "consent" }
}
```

Google's device flow does not allow Gmail/Calendar scopes, and Google issues refresh tokens only with `access_type=offline` (not the `offline_access` scope). Flow-owned parameters (`state`, `redirect_uri`, `client_id`, PKCE, `scope`) cannot be overridden by `authorizationParams`.

`registration: "dynamic"` (no `clientId`) registers a public client via RFC 7591 at the IdP's `registration_endpoint` on first login; the registration is stored with the session and reused (same loopback port) until logout.

Tokens are stored separately, one file per IdP session under `~/.curator/credentials/` (override: `CURATOR_CREDENTIALS_DIR`), mode 0600.

## Usage

```ts
import { AuthSessionManager, createAuthFetch, createConsolePrompt } from '@curator/auth-client';

const auth = await AuthSessionManager.fromConfigFile();
await auth.login('corp', createConsolePrompt());          // or login('crm-mcp', ...) for that service's resource/scopes
const crmFetch = createAuthFetch(auth.provider('crm-mcp')); // bearer + refresh + one retry on 401
console.table(await auth.list());
```

`auth.provider(service)` returns a `CuratorAuthProvider` — the only thing channels and MCP transports need.
When no token can be obtained silently, calls fail with `AuthRequiredError` (`code: 'AUTH_REQUIRED'`); the REPL decides whether to start a login.

## REPL wiring (`@curator/host`)

```ts
const auth = await AuthSessionManager.fromConfigFile();
const channel = await createWebSocketChannel({ serverUrl, auth: auth.provider('curator') });
createClientShell({ channel, auth, openBrowser: true /* autoLogin: true */ }).start();
// One-shot CLI: createHostCli(hostFactory, { auth: () => AuthSessionManager.fromConfigFile() })
//   → `my-cli auth login corp --open`, `my-cli auth list`
```

- `/auth list | login <idp|service> | logout <idp|service> | whoami [target] | cancel [target]`
- Logins run in the background: the REPL stays usable, several IdPs can be pending at once.
- `auth:required` events (`{ service, idp? }`) on the channel, and errors with `code: 'AUTH_REQUIRED'`, print a one-time `/auth login <service>` hint; with `autoLogin` the shell starts the login itself (configured targets only).
- The WebSocket channel sends `Authorization: Bearer` on upgrade, retries once on HTTP 401, and reconnects with a fresh token when the server closes with code `4401`.

## Notes

- Refreshes are serialized per IdP session (rotating refresh tokens). Two separate processes sharing the same credentials file can still race on rotation.
- id_token claims are checked for `iss`/`aud` but the signature is not verified (OIDC Core 3.1.3.7: obtained directly from the token endpoint over TLS). They are for display only; servers must verify access tokens against the IdP's JWKS.
- HTTP is allowed only for loopback hosts; everything else must be HTTPS.
- Requesting service-specific `scope` beyond the IdP login needs `login(<service>)`; refresh cannot widen scopes.

Build: `npm --prefix packages/auth-client run build` · Test: `npm --prefix packages/auth-client test` (tests import `dist/`).
