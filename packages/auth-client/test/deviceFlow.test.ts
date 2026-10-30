import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAuthServerMetadata, OAuthError, runDeviceFlow } from '../dist/index.js';
import { startMockIdp } from './helpers/mockIdp.ts';

const timing = { pollIntervalMs: 10, slowDownIncrementMs: 10 };

test('device flow shows the code and polls through pending and slow_down', async () => {
  const idp = await startMockIdp({ clientId: 'cli', pendingPolls: 2, slowDownOnce: true });
  try {
    const shown: any[] = [];
    const metadata = await fetchAuthServerMetadata(idp.issuer);
    const tokens = await runDeviceFlow({
      idpName: 'corp',
      idp: { issuer: idp.issuer, clientId: 'cli' },
      metadata,
      resource: 'https://api.example.com',
      prompt: {
        showVerification(info) {
          shown.push(info);
          idp.approve(info.userCode);
        },
      },
      ...timing,
    });
    assert.equal(shown.length, 1);
    assert.equal(shown[0].idp, 'corp');
    assert.match(shown[0].verificationUriComplete, /user_code=/);
    assert.ok(tokens.access_token);
    assert.ok(tokens.refresh_token);
    const deviceRequest = idp.requests.find((r) => r.path === '/device')!;
    assert.equal(deviceRequest.params.resource, 'https://api.example.com');
    assert.match(deviceRequest.params.scope, /offline_access/);
    assert.equal(idp.requests.filter((r) => r.path === '/token').length, 3); // slow_down, pending, success
  } finally {
    await idp.close();
  }
});

test('device flow surfaces access_denied', async () => {
  const idp = await startMockIdp({ clientId: 'cli' });
  try {
    const metadata = await fetchAuthServerMetadata(idp.issuer);
    await assert.rejects(
      runDeviceFlow({
        idpName: 'corp',
        idp: { issuer: idp.issuer, clientId: 'cli' },
        metadata,
        prompt: { showVerification: (info) => idp.deny(info.userCode) },
        ...timing,
      }),
      (err: any) => err instanceof OAuthError && err.code === 'access_denied'
    );
  } finally {
    await idp.close();
  }
});

test('device flow can be cancelled through the prompt signal', async () => {
  const idp = await startMockIdp({ clientId: 'cli' });
  try {
    const metadata = await fetchAuthServerMetadata(idp.issuer);
    const controller = new AbortController();
    await assert.rejects(
      runDeviceFlow({
        idpName: 'corp',
        idp: { issuer: idp.issuer, clientId: 'cli' },
        metadata,
        prompt: { signal: controller.signal, showVerification: () => setTimeout(() => controller.abort(new Error('cancelled')), 20) },
        ...timing,
      }),
      /cancelled/
    );
  } finally {
    await idp.close();
  }
});

test('device flow refuses an IdP without a device endpoint', async () => {
  const idp = await startMockIdp({ clientId: 'cli', deviceGrant: false });
  try {
    const metadata = await fetchAuthServerMetadata(idp.issuer);
    await assert.rejects(
      runDeviceFlow({ idpName: 'corp', idp: { issuer: idp.issuer, clientId: 'cli' }, metadata, prompt: { showVerification() {} } }),
      /does not support the device authorization grant/
    );
  } finally {
    await idp.close();
  }
});
