import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { JwtVerificationError, createJwtVerifier } from '../dist/index.js';

const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const rotated = generateKeyPairSync('rsa', { modulusLength: 2048 });

const b64 = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url');

function signJwt(claims: object, opts: { kid: string; alg?: string; key?: KeyObject }) {
  const alg = opts.alg ?? 'RS256';
  const head = `${b64({ alg, kid: opts.kid, typ: 'JWT' })}.${b64(claims)}`;
  const sig =
    alg === 'ES256'
      ? sign('sha256', Buffer.from(head), { key: opts.key ?? ec.privateKey, dsaEncoding: 'ieee-p1363' })
      : sign('sha256', Buffer.from(head), opts.key ?? rsa.privateKey);
  return `${head}.${sig.toString('base64url')}`;
}

const now = () => Math.floor(Date.now() / 1000);
const base = () => ({ iss: 'https://idp.test', aud: 'client-1', sub: 'u1', email: 'u1@x.test', email_verified: true, iat: now(), exp: now() + 300 });

async function startJwks(initial: { kid: string; key: KeyObject }[]) {
  let keys = initial;
  let fetches = 0;
  const server = http.createServer((_req, res) => {
    fetches++;
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' });
    res.end(JSON.stringify({ keys: keys.map(({ kid, key }) => ({ ...key.export({ format: 'jwk' }), kid, use: 'sig' })) }));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/certs`,
    get fetches() {
      return fetches;
    },
    setKeys(next: typeof keys) {
      keys = next;
    },
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

const rejects = (p: Promise<unknown>, code: string) =>
  assert.rejects(p, (e: any) => e instanceof JwtVerificationError && e.code === code);

test('valid RS256 and ES256 tokens verify; keys are cached', async () => {
  const jwks = await startJwks([
    { kid: 'r1', key: rsa.publicKey },
    { kid: 'e1', key: ec.publicKey },
  ]);
  try {
    const verifier = createJwtVerifier({ issuers: ['https://idp.test'], audience: 'client-1', jwksUri: jwks.url, requireVerifiedEmail: true });
    const rs = await verifier.verify(signJwt(base(), { kid: 'r1' }));
    assert.deepEqual([rs.subject, rs.email, rs.issuer], ['u1', 'u1@x.test', 'https://idp.test']);
    const es = await verifier.verify(signJwt({ ...base(), aud: ['other', 'client-1'] }, { kid: 'e1', alg: 'ES256' }));
    assert.equal(es.subject, 'u1');
    assert.equal(jwks.fetches, 1);
  } finally {
    await jwks.close();
  }
});

test('claims are enforced: issuer, audience, expiry, not-before, verified email', async () => {
  const jwks = await startJwks([{ kid: 'r1', key: rsa.publicKey }]);
  try {
    const v = createJwtVerifier({ issuers: ['https://idp.test'], audience: 'client-1', jwksUri: jwks.url, requireVerifiedEmail: true });
    await rejects(v.verify(signJwt({ ...base(), iss: 'https://evil.test' }, { kid: 'r1' })), 'bad_issuer');
    await rejects(v.verify(signJwt({ ...base(), aud: 'someone-else' }, { kid: 'r1' })), 'bad_audience');
    await rejects(v.verify(signJwt({ ...base(), exp: now() - 120 }, { kid: 'r1' })), 'expired');
    await rejects(v.verify(signJwt({ ...base(), exp: undefined }, { kid: 'r1' })), 'expired');
    await rejects(v.verify(signJwt({ ...base(), nbf: now() + 600 }, { kid: 'r1' })), 'not_yet_valid');
    await rejects(v.verify(signJwt({ ...base(), email_verified: false }, { kid: 'r1' })), 'unverified_email');
    // Within clock tolerance (60 s) an just-expired token still passes.
    await v.verify(signJwt({ ...base(), exp: now() - 10 }, { kid: 'r1' }));
  } finally {
    await jwks.close();
  }
});

test('forged tokens are rejected: tampering, alg none, HMAC with the public key, wrong key type', async () => {
  const jwks = await startJwks([
    { kid: 'r1', key: rsa.publicKey },
    { kid: 'e1', key: ec.publicKey },
  ]);
  try {
    const v = createJwtVerifier({ issuers: ['https://idp.test'], audience: 'client-1', jwksUri: jwks.url });
    const good = signJwt(base(), { kid: 'r1' });
    const [h, , s] = good.split('.');
    await rejects(v.verify(`${h}.${b64({ ...base(), sub: 'admin' })}.${s}`), 'bad_signature');

    await rejects(v.verify(`${b64({ alg: 'none', kid: 'r1' })}.${b64(base())}.`), 'unsupported_alg');

    const pem = rsa.publicKey.export({ type: 'spki', format: 'pem' });
    const hsHead = `${b64({ alg: 'HS256', kid: 'r1' })}.${b64(base())}`;
    await rejects(v.verify(`${hsHead}.${createHmac('sha256', pem).update(hsHead).digest('base64url')}`), 'unsupported_alg');

    // RS256 header pointing at an EC key.
    await rejects(v.verify(signJwt(base(), { kid: 'e1', alg: 'RS256', key: rsa.privateKey })), 'unsupported_alg');
    await rejects(v.verify('not-a-jwt'), 'malformed');
  } finally {
    await jwks.close();
  }
});

test('key rotation: an unknown kid triggers a (rate-limited) refetch', async () => {
  const jwks = await startJwks([{ kid: 'r1', key: rsa.publicKey }]);
  let clock = Date.now();
  try {
    const v = createJwtVerifier({ issuers: ['https://idp.test'], audience: 'client-1', jwksUri: jwks.url, now: () => clock });
    await v.verify(signJwt(base(), { kid: 'r1' }));
    jwks.setKeys([{ kid: 'r2', key: rotated.publicKey }]);

    // Right after a fetch, an unknown kid does not hammer the JWKS endpoint.
    await rejects(v.verify(signJwt(base(), { kid: 'r2', key: rotated.privateKey })), 'unknown_key');
    assert.equal(jwks.fetches, 1);

    clock += 31_000;
    const rotatedOk = await v.verify(signJwt({ ...base(), iat: Math.floor(clock / 1000), exp: Math.floor(clock / 1000) + 300 }, { kid: 'r2', key: rotated.privateKey }));
    assert.equal(rotatedOk.subject, 'u1');
    assert.equal(jwks.fetches, 2);
  } finally {
    await jwks.close();
  }
});
