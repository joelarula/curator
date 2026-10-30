import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthSessionManager, MemoryTokenStore, OAuthError, RedirectRegistry, createPkcePair, sessionKey } from '../dist/index.js';
import { startMockIdp, startMockResource } from './helpers/mockIdp.ts';

/** Plays the browser: opens the sign-in URL at the IdP and returns where it redirects to. */
async function signIn(authorizationUrl: string): Promise<string> {
  const res = await fetch(authorizationUrl, { redirect: 'manual' });
  const location = res.headers.get('location');
  if (!location) throw new Error(`IdP did not redirect (HTTP ${res.status})`);
  return location;
}

/** Browser that also follows the redirect back to the loopback listener. */
function loopbackBrowser(seen: any[] = []) {
  return {
    seen,
    showVerification() {
      throw new Error('device flow not expected');
    },
    showAuthorization(info: any) {
      seen.push(info);
      signIn(info.authorizationUrl).then((location) => fetch(location));
    },
  };
}

test('PKCE login through a loopback redirect, with extra authorization params', async () => {
  const idp = await startMockIdp({ clientId: 'desktop', issParam: true });
  try {
    const manager = new AuthSessionManager({
      store: new MemoryTokenStore(),
      config: {
        idps: {
          google: {
            issuer: idp.issuer,
            clientId: 'desktop',
            flow: 'authorization_code',
            scope: 'openid email https://www.googleapis.com/auth/gmail.readonly',
            audienceParam: 'none',
            // Google-style refresh-token request; flow-owned params cannot be overridden.
            authorizationParams: { access_type: 'offline', prompt: 'consent', state: 'attacker', redirect_uri: 'https://evil.test' },
          },
        },
        services: { gmail: { url: `${idp.url}/gmail/mcp`, idp: 'google' } },
      },
    });
    const browser = loopbackBrowser();
    const identity = await manager.login('google', browser);
    assert.equal(identity.sub, 'alice');
    assert.equal(identity.email, 'alice@example.test');

    const info = browser.seen[0];
    assert.match(info.redirectUri, /^http:\/\/127\.0\.0\.1:\d+\/callback$/);
    const sent = idp.authorizeRequests[0];
    assert.equal(sent.get('access_type'), 'offline');
    assert.equal(sent.get('prompt'), 'consent');
    assert.equal(sent.get('redirect_uri'), info.redirectUri);
    assert.notEqual(sent.get('state'), 'attacker');
    assert.equal(sent.get('code_challenge_method'), 'S256');
    assert.equal(sent.get('scope'), 'openid email https://www.googleapis.com/auth/gmail.readonly');
    assert.equal(sent.get('resource'), null);

    // The session is usable for the service and refreshes like device-flow sessions.
    assert.ok(await manager.getAccessToken('gmail'));
    // The loopback listener is gone after the login.
    await assert.rejects(fetch(info.redirectUri));
  } finally {
    await idp.close();
  }
});

test('flow auto uses the authorization code grant when the IdP has no device endpoint', async () => {
  const idp = await startMockIdp({ clientId: 'cli', deviceGrant: false });
  try {
    const manager = new AuthSessionManager({ store: new MemoryTokenStore(), config: { idps: { corp: { issuer: idp.issuer, clientId: 'cli' } } } });
    const identity = await manager.login('corp', loopbackBrowser());
    assert.equal(identity.sub, 'alice');
    assert.equal(idp.requests.filter((r) => r.path === '/device').length, 0);
  } finally {
    await idp.close();
  }
});

test('web apps receive the callback on their own route (redirectMode external)', async () => {
  const idp = await startMockIdp({ clientId: 'web' });
  try {
    const manager = new AuthSessionManager({
      store: new MemoryTokenStore(),
      redirectMode: 'external',
      config: { idps: { google: { issuer: idp.issuer, clientId: 'web', flow: 'authorization_code', redirectUri: 'https://app.example/auth/callback' } } },
    });
    let location = '';
    const login = manager.login('google', {
      showVerification() {},
      showAuthorization: (info) => {
        signIn(info.authorizationUrl).then((l) => (location = l));
      },
    });
    while (!location) await new Promise((r) => setTimeout(r, 5));
    assert.ok(location.startsWith('https://app.example/auth/callback?'));
    assert.equal(manager.handleRedirect('https://app.example/auth/callback?code=x&state=forged'), false);
    assert.equal(manager.handleRedirect(location), true);
    assert.equal((await login).sub, 'alice');
    // A replayed callback no longer matches a pending login.
    assert.equal(manager.handleRedirect(location), false);
  } finally {
    await idp.close();
  }
});

test('dynamic client registration, reused (same loopback port) on the next login', async () => {
  const idp = await startMockIdp({ clientId: 'unused', registration: true, deviceGrant: false, authorizeSub: 'bob' });
  try {
    const store = new MemoryTokenStore();
    const manager = new AuthSessionManager({
      store,
      config: { idps: { ws: { issuer: idp.issuer, registration: 'dynamic', clientName: 'Curator Harness' } } },
    });
    const first = loopbackBrowser();
    assert.equal((await manager.login('ws', first)).sub, 'bob');
    assert.equal(idp.registeredClients.size, 1);
    const [clientId, uris] = [...idp.registeredClients][0];
    assert.deepEqual(uris, [first.seen[0].redirectUri]);

    const key = sessionKey({ issuer: idp.issuer });
    const session = await store.get(key);
    assert.equal(session?.clientId, clientId);
    assert.equal(session?.registration?.clientId, clientId);
    assert.equal((await manager.list())[0].clientId, clientId);

    const second = loopbackBrowser();
    await manager.login('ws', second);
    assert.equal(idp.registeredClients.size, 1, 'registration reused');
    assert.equal(second.seen[0].redirectUri, first.seen[0].redirectUri);
  } finally {
    await idp.close();
  }
});

test('dynamic registration also serves discovered MCP-style resources', async () => {
  const idp = await startMockIdp({ clientId: 'unused', registration: true, deviceGrant: false });
  const mcp = await startMockResource({ authorizationServers: () => [idp.issuer] });
  try {
    const manager = new AuthSessionManager({
      store: new MemoryTokenStore(),
      config: { idps: { ws: { issuer: idp.issuer, registration: 'dynamic' } }, services: { workspace: { url: mcp.url, kind: 'mcp' } } },
    });
    await manager.login('workspace', loopbackBrowser());
    // Token was requested for the resource the server advertised.
    assert.equal(idp.authorizeRequests[0].get('resource'), mcp.url);
    const token = await manager.getAccessToken('workspace');
    const res = await fetch(mcp.url, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(res.status, 200);
  } finally {
    await Promise.all([idp.close(), mcp.close()]);
  }
});

test('authorization errors, issuer mix-ups and cancellation fail the login', async () => {
  const denied = await startMockIdp({ clientId: 'c', denyAuthorize: true });
  const mixup = await startMockIdp({ clientId: 'c', issOverride: 'https://other-idp.example' });
  try {
    const login = (url: string, prompt: any) =>
      new AuthSessionManager({ store: new MemoryTokenStore(), config: { idps: { x: { issuer: url, clientId: 'c', flow: 'authorization_code' } } } }).login('x', prompt);

    await assert.rejects(login(denied.issuer, loopbackBrowser()), (e: any) => e instanceof OAuthError && e.code === 'access_denied');
    await assert.rejects(login(mixup.issuer, loopbackBrowser()), (e: any) => e instanceof OAuthError && e.code === 'invalid_issuer');

    const controller = new AbortController();
    await assert.rejects(
      login(denied.issuer, { signal: controller.signal, showVerification() {}, showAuthorization: () => controller.abort(new Error('cancelled')) }),
      /cancelled/
    );
  } finally {
    await Promise.all([denied.close(), mixup.close()]);
  }
});

test('RedirectRegistry delivers by state and times out', async () => {
  const registry = new RedirectRegistry();
  const waiting = registry.expect('s1', 1000);
  assert.equal(registry.deliver('?state=nope&code=1'), false);
  assert.equal(registry.deliver('state=s1&code=abc'), true);
  assert.equal((await waiting).get('code'), 'abc');
  assert.equal(registry.size, 0);
  await assert.rejects(registry.expect('s2', 10), (e: any) => e.code === 'expired_token');
  assert.equal(registry.size, 0);
});

test('PKCE pair uses S256 and a high-entropy verifier', async () => {
  const { verifier, challenge } = createPkcePair();
  assert.ok(verifier.length >= 43 && verifier.length <= 128);
  const { createHash } = await import('node:crypto');
  assert.equal(challenge, createHash('sha256').update(verifier).digest('base64url'));
});
