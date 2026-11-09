import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSpeechActs,
  formatSpeechActsForTerminal,
  withSpeechActPromptRules,
  SPEECH_ACT_PROMPT_GUIDELINES,
} from '../dist/contracts/speechActs.js';

test('parseSpeechActs extracts suggestions, choices, and callouts cleanly', () => {
  const rawText = `
I have analyzed your database schema.

<callout type="tip" title="Index Recommendation">
Consider adding an index on users(email) for 3x faster lookups.
</callout>

Here are the paths you can take:
<choose prompt="Choose deployment path" blocking="true">
  <option value="opfs" label="OPFS In-Worker" recommended="true">Run locally in browser OPFS</option>
  <option value="postgres" label="PostgreSQL Host" alias="pg,server">Connect to host Postgres</option>
</choose>

What would you like to inspect next?
<suggest>
  <chip prompt="Explain query planner">Explain query planner</chip>
  <chip prompt="Run migration">Run migration</chip>
</suggest>
`.trim();

  const parsed = parseSpeechActs(rawText);

  assert.equal(parsed.hasSpeechActs, true);
  assert.ok(parsed.cleanText.includes('I have analyzed your database schema.'));
  assert.ok(parsed.cleanText.includes('Here are the paths you can take:'));
  assert.ok(parsed.cleanText.includes('What would you like to inspect next?'));
  // Tags should be stripped from cleanText
  assert.ok(!parsed.cleanText.includes('<choose'));
  assert.ok(!parsed.cleanText.includes('<suggest'));
  assert.ok(!parsed.cleanText.includes('<callout'));

  // Callouts
  assert.equal(parsed.callouts.length, 1);
  assert.equal(parsed.callouts[0].type, 'tip');
  assert.equal(parsed.callouts[0].title, 'Index Recommendation');
  assert.ok(parsed.callouts[0].body.includes('Consider adding an index'));

  // Choices
  assert.equal(parsed.choiceGroups.length, 1);
  assert.equal(parsed.choiceGroups[0].prompt, 'Choose deployment path');
  assert.equal(parsed.choiceGroups[0].blocking, true);
  assert.equal(parsed.choiceGroups[0].options.length, 2);
  assert.equal(parsed.choiceGroups[0].options[0].value, 'opfs');
  assert.equal(parsed.choiceGroups[0].options[0].recommended, true);
  assert.deepEqual(parsed.choiceGroups[0].options[1].aliases, ['pg', 'server']);

  // Active Choices
  assert.equal(parsed.activeChoices.length, 2);
  assert.equal(parsed.activeChoices[0].label, 'OPFS In-Worker');
  assert.equal(parsed.activeChoices[0].value, 'opfs');
  assert.equal(parsed.activeChoices[0].blocking, true);

  // Suggestions
  assert.equal(parsed.suggestions.length, 2);
  assert.equal(parsed.suggestions[0].label, 'Explain query planner');
  assert.equal(parsed.suggestions[0].prompt, 'Explain query planner');
  assert.equal(parsed.suggestions[1].label, 'Run migration');
  assert.equal(parsed.suggestions[1].prompt, 'Run migration');
});

test('parseSpeechActs handles shorthand suggest tags and self-closing options', () => {
  const rawText = `
Here is a quick answer.
<choose prompt="Select environment">
  <option value="dev" label="Development" />
  <option value="prod" label="Production" />
</choose>
<suggest prompt="Show status">Status</suggest>
`;

  const parsed = parseSpeechActs(rawText);
  assert.equal(parsed.activeChoices.length, 2);
  assert.equal(parsed.activeChoices[0].value, 'dev');
  assert.equal(parsed.activeChoices[1].value, 'prod');
  assert.equal(parsed.suggestions.length, 1);
  assert.equal(parsed.suggestions[0].label, 'Status');
  assert.equal(parsed.suggestions[0].prompt, 'Show status');
});

test('formatSpeechActsForTerminal decorates terminal output with ANSI colors', () => {
  const rawText = `
All systems nominal.
<callout type="warning" title="Disk Space">Disk is at 85% capacity.</callout>
<suggest>
  <chip prompt="Clean logs">Clean logs</chip>
</suggest>
`;
  const formatted = formatSpeechActsForTerminal(rawText);
  assert.ok(formatted.includes('All systems nominal.'));
  assert.ok(formatted.includes('Disk Space'));
  assert.ok(formatted.includes('Suggestions:'));
  assert.ok(formatted.includes('Clean logs'));
});

test('withSpeechActPromptRules appends guidelines', () => {
  const base = 'You are a Curator DB agent.';
  const combined = withSpeechActPromptRules(base);
  assert.ok(combined.startsWith('You are a Curator DB agent.'));
  assert.ok(combined.includes(SPEECH_ACT_PROMPT_GUIDELINES));
});
