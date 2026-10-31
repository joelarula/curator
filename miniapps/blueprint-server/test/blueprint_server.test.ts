import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createBlueprintServer } from '../dist/createBlueprintServer.js';

import { CuratorEngine } from '@curator/agent-server';
import { createCuratorHost } from '@curator/host';
import { createMcpClientPlugin } from '@curator/plugin-mcp-client';

const CLIENT_ID = 'demo-client.apps.googleusercontent.com';
const ISSUER = 'https://accounts.google.com';
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const b64 = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url');
const now = () => Math.floor(Date.now() / 1000);

/** A Google-style id_token signed with the test key (served from the local JWKS). */
function idToken(claims: Record<string, unknown> = {}) {
  const head = `${b64({ alg: 'RS256', kid: 'test-key', typ: 'JWT' })}.${b64({
    iss: ISSUER,
    aud: CLIENT_ID,
    sub: 'google-sub-1',
    email: 'demo@example.test',
    email_verified: true,
    name: 'Demo User',
    iat: now(),
    exp: now() + 3600,
    ...claims,
  })}`;
  return `${head}.${sign('sha256', Buffer.from(head), keys.privateKey).toString('base64url')}`;
}

async function listen(handler: http.RequestListener) {
  const server = http.createServer(handler);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () =>
      new Promise<void>((r) => {
        server.closeAllConnections();
        server.close(() => r());
      }),
  };
}

let dir: string;
let jwks: Awaited<ReturnType<typeof listen>>;
let site: Awaited<ReturnType<typeof listen>>;
let blueprint: Awaited<ReturnType<typeof createBlueprintServer>>;

before(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'blueprint-server-'));
  jwks = await listen((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ keys: [{ ...keys.publicKey.export({ format: 'jwk' }), kid: 'test-key', use: 'sig', alg: 'RS256' }] }));
  });
  site = await listen((req, res) => {
    if (req.url === '/article') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        '<html><head><title>Curator Notes</title><meta name="description" content="About Curator"></head>' +
          '<body><nav>menu</nav><article><h1>Hello MCP</h1><p>Read <a href="/next">more</a>.</p></article><script>x()</script></body></html>'
      );
    } else if (req.url === '/moved') {
      res.writeHead(302, { Location: '/article' }).end();
    } else if (req.url === '/binary') {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' }).end('xx');
    } else {
      res.writeHead(404).end();
    }
  });
  blueprint = await createBlueprintServer({
    googleClientId: CLIENT_ID,
    allowedEmails: ['demo@example.test', '@partner.test'],
    port: 0,
    databasePath: path.join(dir, 'server.db'),
    verifier: { jwksUri: `${jwks.url}/certs` },
    // The test pages live on localhost; production keeps private networks blocked.
    fetchOptions: { allowPrivateNetworks: true },
    logger: { info() {}, warn() {}, error() {} } as any,
  });
});

after(async () => {
  await blueprint?.close();
  await Promise.all([jwks?.close(), site?.close()]);
  rmSync(dir, { recursive: true, force: true });
});

const rpc = (body: object, token?: string) =>
  fetch(blueprint.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
const initialize = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } };

test('unauthenticated calls get 401 pointing at protected resource metadata (RFC 9728)', async () => {
  const res = await rpc(initialize);
  assert.equal(res.status, 401);
  const header = res.headers.get('www-authenticate') ?? '';
  const metadataUrl = /resource_metadata="([^"]+)"/.exec(header)?.[1];
  assert.equal(metadataUrl, blueprint.url.replace('/mcp', '/.well-known/oauth-protected-resource/mcp'));

  const metadata = await (await fetch(metadataUrl!)).json();
  assert.equal(metadata.resource, blueprint.url);
  assert.deepEqual(metadata.authorization_servers, [ISSUER]);
});

test('tokens for another client, unverified or non-admitted users, or forged ones are refused', async () => {
  const forged = idToken().replace(/\.[^.]+$/, '.AAAA');
  for (const token of [
    idToken({ aud: 'someone-elses-client' }),
    idToken({ email_verified: false }),
    idToken({ email: 'stranger@example.test', sub: 'g-2' }),
    idToken({ exp: now() - 600 }),
    forged,
  ]) {
    const res = await rpc(initialize, token);
    assert.equal(res.status, 401, `token should be rejected: ${token.slice(0, 20)}`);
    assert.match(res.headers.get('www-authenticate') ?? '', /error="invalid_token"/);
  }
  // Domain allow-list entries admit the whole domain.
  assert.equal((await rpc(initialize, idToken({ email: 'pat@partner.test', sub: 'g-3' }))).status, 200);
});

test('a Curator harness uses the blueprint server through plugin-mcp-client, as the signed-in user', async () => {
  let token: string | null = idToken();
  const auth = {
    serviceNames: () => ['blueprint'],
    provider: (name: string) => ({
      name,
      getAccessToken: async () => token,
      handleUnauthorized: async () => false,
      login: async () => ({ issuer: ISSUER, sub: 'google-sub-1' }),
      invalidate: async () => {},
      logout: async () => {},
      whoami: async () => null,
    }),
  };
  const engine = new CuratorEngine();
  const { plugin, registry } = createMcpClientPlugin({ auth });
  const harness = await createCuratorHost({
    name: 'harness-test',
    projectId: 'harness',
    logLevel: 'warn',
    curatorDb: { path: path.join(dir, 'harness.db') },
    registerPlugins: () => (engine.registerPlugin(plugin), engine),
  } as any);
  try {
    await harness.seed();
    await harness.prisma.role.upsert({ where: { id: 'curator_admin' }, update: {}, create: { id: 'curator_admin', name: 'curator_admin' } });
    await harness.assignUserProjectRole('system', 'curator_admin', 'harness');
    await registry.attach(harness);

    const reg = await registry.register({ projectId: 'harness', name: 'blueprint', url: blueprint.url, authService: 'blueprint' });
    assert.equal(reg.error, undefined, reg.error?.message);
    assert.equal(reg.sync?.tools, 1);
    const row = await harness.prisma.tool.findUnique({ where: { name: 'mcp.blueprint.web_scrape@harness' } });
    assert.equal(row.origin, 'remote');
    assert.equal(row.accessLevel, 'read_only', 'read_only on the server is announced via annotations');

    const out = await harness.runTool('mcp.blueprint.web_scrape', { url: `${site.url}/moved` });
    assert.equal(out.result.title, 'Curator Notes');
    assert.equal(out.result.finalUrl, `${site.url}/article`);
    assert.match(out.result.markdown, /# Hello MCP/);
    assert.match(out.result.markdown, new RegExp(`\\[more\\]\\(${site.url}/next\\)`));
    assert.doesNotMatch(out.result.markdown, /menu|x\(\)/);

    // Server side: the call is a Request owned by the mapped Google user, in the server's project.
    const user = await blueprint.host.prisma.user.findUnique({ where: { email: 'demo@example.test' } });
    assert.equal(user.googleId, 'google-sub-1');
    const roles = await blueprint.host.getUserProjectRoles(user.id, 'blueprint-server');
    assert.ok(roles.includes('web_reader'));
    const request = await blueprint.host.prisma.request.findFirst({ where: { toolName: 'web_scrape' }, orderBy: { id: 'desc' } });
    assert.equal(request.userId, user.id);
    assert.equal(request.projectId, 'blueprint-server');

    // Non-HTML content is refused by the server and reported as a tool error.
    await assert.rejects(harness.runTool('mcp.blueprint.web_scrape', { url: `${site.url}/binary` }), /Unsupported content type/);

    // An expired session surfaces as AUTH_REQUIRED on the harness.
    token = null;
    await registry.close();
    await registry.attach(harness);
    await assert.rejects(harness.runTool('mcp.blueprint.web_scrape', { url: `${site.url}/article` }), (e: any) => e.code === 'AUTH_REQUIRED' || /Authentication required/.test(e.message));
  } finally {
    await registry.close();
    await harness.stop();
  }
});
