import test from 'node:test';
import assert from 'node:assert/strict';
import { BlockedUrlError, isBlockedAddress, safeFetchText } from '../dist/index.js';

test('safeFetchText refuses internal targets by default', async () => {
  for (const url of [
    'http://127.0.0.1:1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://[::1]/',
    'http://10.0.0.5/',
    'http://localhost/',
    'ftp://example.com/',
    'http://user:pass@example.com/',
  ]) {
    await assert.rejects(safeFetchText(url), BlockedUrlError, url);
  }
  assert.equal(isBlockedAddress('::ffff:127.0.0.1'), true);
  assert.equal(isBlockedAddress('100.64.1.1'), true);
  assert.equal(isBlockedAddress('93.184.216.34'), false);
  assert.equal(isBlockedAddress('2606:4700::1111'), false);
});
