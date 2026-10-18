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
const MODEL = process.env.GEMINI_TEST_MODEL || 'gemini-3.1-flash-lite';
const skip = !API_KEY && 'GOOGLE_API_KEY not set';

async function generate(contents) {
  console.log(`>>> REQUEST contents:\n${JSON.stringify(contents, null, 2)}`);
  const res = await fetch(`${BASE}/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ contents }),
  });
  const text = await res.text();
  assert.equal(res.status, 200, `${res.status} ${text}`);
  const json = JSON.parse(text);
  console.log(`<<< RESPONSE:\n${JSON.stringify(json, null, 2)}`);
  return {
    reply: json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '',
    promptTokens: json.usageMetadata?.promptTokenCount,
  };
}

test(`${MODEL} multi-turn conversation keeps context (3 cycles)`, { skip }, async () => {
  const userTurns = [
    'My name is Joel and my favorite number is 42. Just acknowledge briefly.',
    'Multiply my favorite number by 2. Reply with the number only.',
    'What is my name, and what was the result of the previous calculation? Be brief.',
  ];

  // The API is stateless: the full history is resent on every cycle.
  const history = [];
  const replies = [];
  const promptTokens = [];

  for (const [i, text] of userTurns.entries()) {
    history.push({ role: 'user', parts: [{ text }] });
    const { reply, promptTokens: pt } = await generate(history);
    history.push({ role: 'model', parts: [{ text: reply }] });
    replies.push(reply);
    promptTokens.push(pt);
    console.log(`--- cycle ${i + 1} (history: ${history.length - 1} msgs, promptTokens: ${pt})\nUSER:  ${text}\nMODEL: ${reply.trim()}`);
  }

  assert.match(replies[1], /84/);
  assert.match(replies[2], /Joel/i);
  assert.match(replies[2], /84/);
  assert.ok(promptTokens[2] > promptTokens[0], 'prompt grows as history is resent');
});
