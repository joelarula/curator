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
const MODEL = process.env.GEMINI_TEST_MODEL || 'gemini-2.5-flash';

async function get(path) {
  const res = await fetch(`${BASE}/${path}`, { headers: { 'x-goog-api-key': API_KEY } });
  assert.equal(res.status, 200, `GET ${path} -> ${res.status} ${await res.clone().text()}`);
  return res.json();
}

test('models.list returns models with operational constraints', { skip: !API_KEY && 'GOOGLE_API_KEY not set' }, async () => {
  const { models } = await get('models?pageSize=1000');
  assert.ok(models.length > 0);
  console.table(
    models.map((m) => ({
      name: m.name,
      inputTokenLimit: m.inputTokenLimit,
      outputTokenLimit: m.outputTokenLimit,
      methods: (m.supportedGenerationMethods || []).join(','),
    }))
  );
  const gen = models.find((m) => m.supportedGenerationMethods?.includes('generateContent'));
  assert.ok(gen, 'at least one model supports generateContent');
});

test('models.get returns limits and supported methods', { skip: !API_KEY && 'GOOGLE_API_KEY not set' }, async () => {
  const m = await get(`models/${MODEL}`);
  console.log({
    name: m.name,
    inputTokenLimit: m.inputTokenLimit,
    outputTokenLimit: m.outputTokenLimit,
    supportedGenerationMethods: m.supportedGenerationMethods,
  });
  assert.equal(typeof m.inputTokenLimit, 'number');
  assert.equal(typeof m.outputTokenLimit, 'number');
  assert.ok(Array.isArray(m.supportedGenerationMethods));
  assert.ok(m.supportedGenerationMethods.includes('generateContent'));
});
