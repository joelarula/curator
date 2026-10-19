import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(resolve(here, '../../../.env'));
} catch {}

const API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
// Comma-separated override, e.g. GEMINI_TEST_MODELS=gemini-2.0-flash
const MODELS = (process.env.GEMINI_TEST_MODELS || 'gemini-3.1-flash-lite,gemini-2.0-flash,gemini-1.5-flash').split(',');
const skip = !API_KEY && 'GOOGLE_API_KEY not set';

// Only the log is shortened; the request itself is sent in full.
const clip = (_k, v) => (typeof v === 'string' && v.length > 120 ? `${v.slice(0, 80)}... (${v.length} chars)` : v);

async function api(method, path, body) {
  console.log(`REQUEST ${method} ${path}${body ? `\n${JSON.stringify(body, clip, 2)}` : ''}`);
  const res = await fetch(`${BASE}/${path}`, {
    method,
    headers: { 'x-goog-api-key': API_KEY, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let shown = text;
  try {
    shown = JSON.stringify(JSON.parse(text), clip, 2);
  } catch {}
  console.log(`RESPONSE ${res.status}\n${shown}\n`);
  assert.equal(res.status, 200, `${method} ${path} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

const textOf = (r) => r.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';

// Returns a skip reason for expected, non-bug failures.
function skipReason(e) {
  const m = String(e.message);
  if (m.includes('FreeTier') && m.includes('StorageTokens')) return 'explicit caching needs a billing-enabled API key';
  if (m.includes('404') || m.includes('NOT_FOUND')) return 'model not available to this key';
  if (m.includes('429')) return 'quota exceeded';
  return null;
}

// Padding only exists to pass the minimum cacheable token size.
const padding = Array.from({ length: 1500 }, (_, i) => `Filler line ${i + 1}: nothing important here.`).join('\n');
const SECRET = 'The secret word is PINEAPPLE-7731.';

for (const MODEL of MODELS) {
  test(`${MODEL} explicit cache: save secret, recall later`, { skip }, async (t) => {
    let cache;
    try {
      cache = await api('POST', 'cachedContents', {
        model: `models/${MODEL}`,
        contents: [{ role: 'user', parts: [{ text: `${SECRET}\n${padding}` }] }],
        ttl: '300s',
      });
    } catch (e) {
      const reason = skipReason(e);
      if (reason) return t.skip(reason);
      throw e;
    }

    try {
      // The secret is not in these requests, only in the cache.
      for (const q of ['What is the secret word?', 'Repeat the secret word in uppercase.']) {
        const json = await api('POST', `models/${MODEL}:generateContent`, {
          cachedContent: cache.name,
          contents: [{ role: 'user', parts: [{ text: q }] }],
        });
        assert.match(textOf(json), /PINEAPPLE-7731/i);
        assert.ok(json.usageMetadata.cachedContentTokenCount > 0);
      }
    } finally {
      await api('DELETE', cache.name);
    }
  });

  test(`${MODEL} implicit cache: recall secret from repeated prefix`, { skip }, async (t) => {
    // Identical prefix every turn; only the trailing question changes.
    const history = [
      { role: 'user', parts: [{ text: `${SECRET}\n${padding}` }] },
      { role: 'model', parts: [{ text: 'Understood.' }] },
    ];
    const cached = [];

    try {
      for (const q of ['What is the secret word?', 'Repeat the secret word in uppercase.', 'Spell the secret word letter by letter.']) {
        history.push({ role: 'user', parts: [{ text: q }] });
        const json = await api('POST', `models/${MODEL}:generateContent`, { contents: history });
        const reply = textOf(json);
        history.push({ role: 'model', parts: [{ text: reply }] });
        cached.push(json.usageMetadata?.cachedContentTokenCount ?? 0);
        assert.match(reply.replace(/[^A-Za-z0-9]/g, ''), /PINEAPPLE7731/i);
      }
    } catch (e) {
      const reason = skipReason(e);
      if (reason) return t.skip(reason);
      throw e;
    }

    console.log(`${MODEL} cachedContentTokenCount per turn:`, cached);
  });
}
