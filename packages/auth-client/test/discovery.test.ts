import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertSecureUrl,
  fetchAuthServerMetadata,
  fetchProtectedResourceMetadata,
  parseWwwAuthenticate,
} from '../dist/index.js';
import { startMockIdp, startMockResource } from './helpers/mockIdp.ts';

test('assertSecureUrl allows https and loopback http only', () => {
  assert.ok(assertSecureUrl('https://idp.example.com', 'x'));
  assert.ok(assertSecureUrl('http://127.0.0.1:8080', 'x'));
  assert.ok(assertSecureUrl('http://localhost/realms/a', 'x'));
  assert.throws(() => assertSecureUrl('http://idp.example.com', 'x'), /must use https/);
});

test('parseWwwAuthenticate reads quoted and bare Bearer params', () => {
  const params = parseWwwAuthenticate(
    'Bearer realm="mcp", error=insufficient_scope, resource_metadata="https://a.test/.well-known/oauth-protected-resource/mcp"'
  );
  assert.equal(params.realm, 'mcp');
  assert.equal(params.error, 'insufficient_scope');
  assert.equal(params.resource_metadata, 'https://a.test/.well-known/oauth-protected-resource/mcp');
  assert.deepEqual(parseWwwAuthenticate('Basic realm="x"'), {});
});

test('fetchAuthServerMetadata uses OIDC discovery for issuers with a path', async () => {
  const idp = await startMockIdp({ clientId: 'cli', issuerPath: '/realms/main' });
  try {
    const metadata = await fetchAuthServerMetadata(idp.issuer);
    assert.equal(metadata.issuer, idp.issuer);
    assert.equal(metadata.device_authorization_endpoint, `${idp.url}/device`);
  } finally {
    await idp.close();
  }
});

test('fetchAuthServerMetadata rejects an issuer mismatch', async () => {
  const idp = await startMockIdp({ clientId: 'cli', advertisedIssuer: 'https://evil.example.com' });
  try {
    await assert.rejects(fetchAuthServerMetadata(idp.issuer), /Issuer mismatch/);
  } finally {
    await idp.close();
  }
});

test('fetchProtectedResourceMetadata finds the path-inserted well-known document', async () => {
  const resource = await startMockResource({ authorizationServers: () => ['https://idp.example.com'] });
  try {
    const prm = await fetchProtectedResourceMetadata(resource.url);
    assert.equal(prm.resource, resource.url);
    assert.deepEqual(prm.authorization_servers, ['https://idp.example.com']);
  } finally {
    await resource.close();
  }
});

test('fetchProtectedResourceMetadata rejects a resource claimed for another origin', async () => {
  const resource = await startMockResource({
    authorizationServers: () => ['https://idp.example.com'],
    claimedResource: 'https://other.example.com/mcp',
  });
  try {
    await assert.rejects(fetchProtectedResourceMetadata(resource.url), /does not cover/);
  } finally {
    await resource.close();
  }
});
