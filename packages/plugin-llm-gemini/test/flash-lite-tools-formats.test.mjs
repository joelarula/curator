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
const MODEL = 'gemini-2.5-flash-lite';
const skip = !API_KEY && 'GOOGLE_API_KEY not set';

async function post(path, body) {
  console.log(`REQUEST POST ${path}\n${JSON.stringify(body, null, 2)}`);
  const res = await fetch(`${BASE}/${path}`, {
    method: 'POST',
    headers: { 'x-goog-api-key': API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  assert.equal(res.status, 200, `POST ${path} -> ${res.status} ${text}`);
  return JSON.parse(text);
}

const textOf = (r) => r.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';

test(`${MODEL} models.get metadata`, { skip }, async () => {
  const res = await fetch(`${BASE}/models/${MODEL}`, { headers: { 'x-goog-api-key': API_KEY } });
  assert.equal(res.status, 200);
  const m = await res.json();
  console.log(m);
  assert.ok(m.supportedGenerationMethods.includes('generateContent'));
});

test(`${MODEL} describes its supported tools and formats`, { skip }, async () => {
  const r = await post(`models/${MODEL}:generateContent`, {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text:
              'List the tools (function calling, code execution, Google Search grounding, URL context, etc.) ' +
              'and the input/output formats (text, image, audio, video, PDF, JSON/structured output, MIME types) ' +
              'that you support. Be concise.',
          },
        ],
      },
    ],
  });
  const answer = textOf(r);
  console.log(answer);
  assert.ok(answer.length > 0);
});

test(`${MODEL} supports structured JSON output`, { skip }, async () => {
  const r = await post(`models/${MODEL}:generateContent`, {
    contents: [
      {
        role: 'user',
        parts: [{ text: 'Return JSON: {"tools": string[], "inputFormats": string[], "outputFormats": string[]} describing what you support.' }],
      },
    ],
    generationConfig: { responseMimeType: 'application/json' },
  });
  const parsed = JSON.parse(textOf(r));
  console.log(parsed);
  assert.ok(Array.isArray(parsed.tools));
});

test(`${MODEL} accepts a function-calling tool`, { skip }, async () => {
  const r = await post(`models/${MODEL}:generateContent`, {
    contents: [{ role: 'user', parts: [{ text: 'What is the weather in Paris?' }] }],
    tools: [
      {
        functionDeclarations: [
          {
            name: 'get_weather',
            description: 'Get current weather for a city',
            parameters: { type: 'OBJECT', properties: { city: { type: 'STRING' } }, required: ['city'] },
          },
        ],
      },
    ],
  });
  const call = r.candidates?.[0]?.content?.parts?.find((p) => p.functionCall)?.functionCall;
  console.log(JSON.stringify(r, null, 2));
  assert.equal(call?.name, 'get_weather');
});
