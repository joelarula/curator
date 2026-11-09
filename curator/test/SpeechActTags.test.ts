import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tagSuggest,
  tagChoose,
  tagCallout,
  withSpeechActGuidelines,
  SPEECH_ACT_PROMPT_GUIDELINES,
} from '../src/engine/builder/conversations/SpeechActComposables.js';

test('tagSuggest formats valid <suggest> block', () => {
  const xml = tagSuggest([
    { label: 'Check Logs', prompt: 'Show server logs' },
    { label: 'Run Migrations' },
  ]);
  assert.ok(xml.includes('<suggest>'));
  assert.ok(xml.includes('<chip prompt="Show server logs">Check Logs</chip>'));
  assert.ok(xml.includes('<chip>Run Migrations</chip>'));
  assert.ok(xml.includes('</suggest>'));
});

test('tagChoose formats valid <choose> block', () => {
  const xml = tagChoose('Pick environment', [
    { value: 'staging', label: 'Staging Server', recommended: true },
    { value: 'prod', label: 'Production Server' },
  ]);
  assert.ok(xml.includes('<choose prompt="Pick environment">'));
  assert.ok(xml.includes('<option value="staging" label="Staging Server" recommended="true">'));
  assert.ok(xml.includes('<option value="prod" label="Production Server">'));
  assert.ok(xml.includes('</choose>'));
});

test('tagCallout formats valid <callout> block', () => {
  const xml = tagCallout('tip', 'Remember to set database url', 'Database Config');
  assert.ok(xml.includes('<callout type="tip" title="Database Config">'));
  assert.ok(xml.includes('Remember to set database url'));
  assert.ok(xml.includes('</callout>'));
});

test('withSpeechActGuidelines appends guidelines', () => {
  const res = withSpeechActGuidelines('You are a curator agent.');
  assert.ok(res.includes('You are a curator agent.'));
  assert.ok(res.includes(SPEECH_ACT_PROMPT_GUIDELINES));
});

