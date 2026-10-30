import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createBlueprintServer } from '../../blueprint-server/dist/createBlueprintServer.js';
import { connectBlueprintServer, createBlueprintRuntime } from '../dist/host.js';
import { createAssistant } from '../dist/harness/assistant.js';
import { LlmFactory } from '../../../curator/dist/src/index.js';

const CLIENT_ID = 'device-client.apps.googleusercontent.com';
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const b64 = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url');
const now = () => Math.floor(Date.now() / 1000);
const idToken = () => {
  const head = `${b64({ alg: 'RS256', kid: 'k1' })}.${b64({
    iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: 'g-1', email: 'demo@example.test', email_verified: true, iat: now(), exp: now() + 3600,
  })}`;
  return `${head}.${sign('sha256', Buffer.from(head), keys.privateKey).toString('base64url')}`;
};

async function listen(handler: http.RequestListener) {
  const server = http.createServer(handler);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise<void>((r) => (server.closeAllConnections(), server.close(() => r()))),
  };
}

let dir: string;
let jwks: Awaited<ReturnType<typeof listen>>;
let site: Awaited<ReturnType<typeof listen>>;
let server: Awaited<ReturnType<typeof createBlueprintServer>>;
let runtime: Awaited<ReturnType<typeof createBlueprintRuntime>>;
let signedIn = false;
const llmRequests: any[] = [];

before(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'blueprint-harness-'));
  jwks = await listen((_q, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ keys: [{ ...keys.publicKey.export({ format: 'jwk' }), kid: 'k1', use: 'sig', alg: 'RS256' }] }));
  });
  site = await listen((_q, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<html><head><title>Curator Release Notes</title></head><body><article><p>Version 2 adds remote MCP tools.</p></article></body></html>');
  });
  server = await createBlueprintServer({
    googleClientId: ['web-client', CLIENT_ID],
    allowedEmails: ['demo@example.test'],
    port: 0,
    databasePath: path.join(dir, 'server.db'),
    verifier: { jwksUri: `${jwks.url}/certs` },
    fetchOptions: { allowPrivateNetworks: true },
    logger: { info() {}, warn() {}, error() {} } as any,
  });
  process.env.BLUEPRINT_MCP_URL = server.url;

  // Stands in for the AuthSessionManager: a Google id_token once "signed in".
  const auth: any = {
    idpNames: () => ['google'],
    serviceNames: () => ['blueprint'],
    provider: (name: string) => ({
      name,
      getAccessToken: async () => (signedIn ? idToken() : null),
      handleUnauthorized: async () => false,
      login: async () => ({ issuer: 'https://accounts.google.com', sub: 'g-1' }),
      invalidate: async () => {},
      logout: async () => {},
      whoami: async () => null,
    }),
  };
  runtime = await createBlueprintRuntime({ auth, databasePath: path.join(dir, 'harness.db') });
  await runtime.host.start(100);

  // Scripted Gemini: first turn calls the remote tool, second answers from its output.
  LlmFactory.registerProvider('gemini', {
    providerName: 'gemini',
    async generateContent(req: any) {
      llmRequests.push(structuredClone(req));
      const toolResult = [...req.messages].reverse().find((m: any) => m.role === 'tool');
      if (!toolResult) {
        return { text: '', toolCalls: [{ id: 'c1', name: 'mcp__blueprint__web_scrape', args: { url: `${site.url}/notes` } }], finishReason: 'tool_use' };
      }
      const page = JSON.parse(toolResult.content);
      return { text: `The page "${page.title}" says: ${page.markdown.trim()}`, finishReason: 'stop' };
    },
  } as any);
});

after(async () => {
  await runtime?.registry.close();
  await runtime?.host.stop();
  await server?.close();
  await Promise.all([jwks?.close(), site?.close()]);
  rmSync(dir, { recursive: true, force: true });
});

test('without a Google session the blueprint server reports AUTH_REQUIRED', async () => {
  const events: any[] = [];
  const off = runtime.host.events.onEvent((e: any) => events.push(e));
  const result = await connectBlueprintServer(runtime);
  off();
  assert.equal(result.error?.code, 'AUTH_REQUIRED');
  assert.ok(events.some((e) => e.type === 'auth:required' && e.payload.service === 'blueprint'));
});

test('after sign-in the assistant reads a web page through the blueprint server', async () => {
  signedIn = true;
  const sync = await runtime.registry.sync(runtime.host.project.id, 'blueprint');
  assert.equal(sync.tools, 1);

  const reply = await createAssistant(runtime.host, { timeoutMs: 30_000 }).ask('What do the release notes say?');
  assert.equal(reply.status, 'COMPLETED', reply.answer);
  assert.deepEqual(reply.tools, ['mcp__blueprint__web_scrape']);
  assert.match(reply.answer, /Curator Release Notes/);
  assert.match(reply.answer, /Version 2 adds remote MCP tools/);

  // The model was offered exactly the blueprint server's tool under its provider-safe name.
  assert.deepEqual(llmRequests[0].tools.map((t: any) => t.name), ['mcp__blueprint__web_scrape']);
  assert.equal(llmRequests[0].messages.at(-1).content, 'What do the release notes say?');

  // On the server, the scrape is a Request owned by the signed-in Google user.
  const user = await server.host.prisma.user.findUnique({ where: { email: 'demo@example.test' } });
  const request = await server.host.prisma.request.findFirst({ where: { toolName: 'web_scrape' }, orderBy: { id: 'desc' } });
  assert.equal(request.userId, user.id);
});
