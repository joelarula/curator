import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AuthConfigError,
  AuthRequiredError,
  AuthSessionManager,
  MemoryTokenStore,
  createAuthFetch,
  sessionKey,
} from '../dist/index.js';
import { autoApprovePrompt, startMockIdp, startMockResource } from './helpers/mockIdp.ts';

const deviceFlow = { pollIntervalMs: 10, slowDownIncrementMs: 10 };

async function setup() {
  const corp = await startMockIdp({ clientId: 'cli-corp' });
  const partner = await startMockIdp({ clientId: 'cli-partner', issuerPath: '/tenant' });
  const crm = await startMockResource({ authorizationServers: () => [corp.issuer] });
  const wiki = await startMockResource({ authorizationServers: () => [corp.issuer], path: '/wiki/mcp' });
  // docs advertises its IdP only through RFC 9728 metadata
  const docs = await startMockResource({ authorizationServers: () => [partner.issuer] });
  const store = new MemoryTokenStore();
  const manager = new AuthSessionManager({
    store,
    deviceFlow,
    config: {
      idps: {
        corp: { issuer: corp.issuer, clientId: 'cli-corp' },
        partner: { issuer: partner.issuer, clientId: 'cli-partner' },
      },
      services: {
        crm: { url: crm.url, kind: 'mcp', idp: 'corp' },
        wiki: { url: wiki.url, kind: 'mcp', idp: 'corp' },
        docs: { url: docs.url, kind: 'mcp' },
      },
    },
  });
  const close = () => Promise.all([corp, partner, crm, wiki, docs].map((s) => s.close()));
  return { corp, partner, crm, wiki, docs, store, manager, close };
}

test('concurrent logins to two IdPs, one discovered via RFC 9728', async () => {
  const env = await setup();
  try {
    const [crmUser, docsUser] = await Promise.all([
      env.manager.login('crm', autoApprovePrompt(env.corp, 'alice')),
      env.manager.login('docs', autoApprovePrompt(env.partner, 'bob')),
    ]);
    assert.equal(crmUser.sub, 'alice');
    assert.equal(crmUser.email, 'alice@example.test');
    assert.equal(docsUser.sub, 'bob');
    assert.equal(docsUser.issuer, env.partner.issuer);

    const crmRes = await createAuthFetch(env.manager.provider('crm'))(env.crm.url);
    const docsRes = await createAuthFetch(env.manager.provider('docs'))(env.docs.url);
    assert.deepEqual(await crmRes.json(), { ok: true, sub: 'alice' });
    assert.deepEqual(await docsRes.json(), { ok: true, sub: 'bob' });

    const sessions = await env.manager.list();
    const corp = sessions.find((s) => s.idp === 'corp')!;
    const partner = sessions.find((s) => s.idp === 'partner')!;
    assert.equal(corp.loggedIn, true);
    assert.deepEqual(corp.services.sort(), ['crm', 'wiki']);
    assert.equal(partner.loggedIn, true);
    assert.deepEqual(partner.services, ['docs']);
    assert.equal(await env.manager.whoami('docs').then((i) => i?.sub), 'bob');
  } finally {
    await env.close();
  }
});

test('one IdP login mints tokens for further services via refresh, serialized under rotation', async () => {
  const env = await setup();
  try {
    await env.manager.login('corp', autoApprovePrompt(env.corp));
    // Both services need a fresh token from the same single-use refresh token chain.
    const [crmToken, wikiToken] = await Promise.all([
      env.manager.getAccessToken('crm'),
      env.manager.getAccessToken('wiki'),
    ]);
    assert.ok(crmToken && wikiToken && crmToken !== wikiToken);
    const refreshes = env.corp.requests.filter((r) => r.params.grant_type === 'refresh_token');
    assert.deepEqual(refreshes.map((r) => r.params.resource).sort(), [env.crm.url, env.wiki.url].sort());
    // Cached afterwards: no extra refresh.
    assert.equal(await env.manager.getAccessToken('crm'), crmToken);
    assert.equal(env.corp.requests.filter((r) => r.params.grant_type === 'refresh_token').length, 2);
    assert.equal((await (await createAuthFetch(env.manager.provider('wiki'))(env.wiki.url)).json()).ok, true);
  } finally {
    await env.close();
  }
});

test('a rejected token is refreshed once on 401 and the request retried', async () => {
  const env = await setup();
  try {
    await env.manager.login('crm', autoApprovePrompt(env.corp));
    const key = sessionKey({ issuer: env.corp.issuer, clientId: 'cli-corp' });
    const session = (await env.store.get(key))!;
    session.accessTokens[env.crm.url] = { accessToken: 'revoked.token.x', expiresAt: Date.now() + 600_000 };
    await env.store.set(key, session);

    const res = await createAuthFetch(env.manager.provider('crm'))(env.crm.url);
    assert.equal(res.status, 200);
    assert.equal(env.crm.accepted, 1);
  } finally {
    await env.close();
  }
});

test('a revoked IdP session requires a new login', async () => {
  const env = await setup();
  try {
    await env.manager.login('corp', autoApprovePrompt(env.corp));
    env.corp.revokeAll();
    assert.equal(await env.manager.getAccessToken('wiki'), null);
    assert.equal(await env.manager.whoami('corp'), null);
    await assert.rejects(createAuthFetch(env.manager.provider('crm'))(env.crm.url), AuthRequiredError);
  } finally {
    await env.close();
  }
});

test('logout revokes the refresh token and leaves other IdPs signed in', async () => {
  const env = await setup();
  try {
    await env.manager.login('corp', autoApprovePrompt(env.corp));
    await env.manager.login('partner', autoApprovePrompt(env.partner, 'bob'));
    await env.manager.logout('crm');
    assert.ok(env.corp.requests.some((r) => r.path === '/revoke' && r.params.token_type_hint === 'refresh_token'));
    assert.equal(await env.manager.getAccessToken('crm'), null);
    assert.ok(await env.manager.getAccessToken('docs'));
  } finally {
    await env.close();
  }
});

test('discovery never trusts an IdP that is not configured', async () => {
  const env = await setup();
  const rogue = await startMockResource({ authorizationServers: () => ['https://unknown-idp.example.com'] });
  try {
    env.manager.addService('rogue', { url: rogue.url, kind: 'mcp' });
    await assert.rejects(env.manager.getAccessToken('rogue'), (err: any) => err instanceof AuthConfigError && /unknown-idp/.test(err.message));
  } finally {
    await rogue.close();
    await env.close();
  }
});

test('config validation rejects services that reference unknown IdPs', () => {
  assert.throws(
    () => new AuthSessionManager({ store: new MemoryTokenStore(), config: { services: { x: { url: 'https://x.test', idp: 'nope' } } } }),
    /unknown idp "nope"/
  );
});

test('services with bearer id_token get the id_token, refreshed when it expires', async () => {
  // id_token lives 30 s: inside the 60 s expiry skew, so every call refreshes.
  const idp = await startMockIdp({ clientId: 'web', idTokenTtl: 30 });
  try {
    const manager = new AuthSessionManager({
      store: new MemoryTokenStore(),
      deviceFlow,
      config: {
        idps: { google: { issuer: idp.issuer, clientId: 'web', audienceParam: 'none' } },
        services: { blueprint: { url: `${idp.url}/mcp`, idp: 'google', bearer: 'id_token' }, api: { url: `${idp.url}/api`, idp: 'google' } },
      },
    });
    await manager.login('google', autoApprovePrompt(idp));
    const claims = (t: string) => JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString());

    const first = await manager.getAccessToken('blueprint');
    assert.equal(claims(first!).aud, 'web');
    assert.ok(claims(first!).email, 'an id_token, not the access token');
    const second = await manager.getAccessToken('blueprint');
    assert.notEqual(claims(second!).n, claims(first!).n, 'expired id_token was refreshed');
    assert.ok(idp.requests.some((r) => r.params.grant_type === 'refresh_token'));

    // Other services of the same IdP still get the access token.
    const access = await manager.getAccessToken('api');
    assert.equal(claims(access!).email, undefined);
  } finally {
    await idp.close();
  }
});
