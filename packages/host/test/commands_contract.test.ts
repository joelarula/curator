import test from 'node:test';
import assert from 'node:assert/strict';
import { parseComposerInput, findComposerTrigger, matchCommands, completeLine, missingToolArgs, toolArgsFromTokens } from '../dist/contracts/commands.js';
import { createClientShell } from '../dist/index.js';

const catalog = [
  { name: 'resources', source: 'command', aliases: ['res'] },
  { name: 'search_knowledge', source: 'tool', parameters: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer' } }, required: ['query'] } },
  { name: 'save_note', source: 'tool', parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
  { name: '1', source: 'choice', title: 'Approve', value: 'yes' },
  { name: 'weather', source: 'agent' },
  { name: 'writer', source: 'agent', title: 'Story writer' },
] as any[];

test('triggers: / at the start, @ at a word start', () => {
  assert.deepEqual(findComposerTrigger('/sea'), { trigger: '/', query: 'sea', start: 0, end: 4 });
  assert.deepEqual(findComposerTrigger('  /'), { trigger: '/', query: '', start: 2, end: 3 });
  assert.equal(findComposerTrigger('/search_knowledge cats'), null, 'past the command word');
  assert.deepEqual(findComposerTrigger('ask @we'), { trigger: '@', query: 'we', start: 4, end: 7 });
  assert.equal(findComposerTrigger('mail me@home'), null, 'not inside a word');
  assert.equal(findComposerTrigger('a / b'), null);
});

test('suggestions: prefix matches first, aliases and titles count, @ lists agents', () => {
  assert.deepEqual(matchCommands(catalog, '/', 's').map((e) => e.name), ['search_knowledge', 'save_note', 'resources']);
  assert.deepEqual(matchCommands(catalog, '/', 'res').map((e) => e.name), ['resources']);
  assert.deepEqual(matchCommands(catalog, '/', 'appr').map((e) => e.name), ['1'], 'choice by its label');
  assert.deepEqual(matchCommands(catalog, '@', 'w').map((e) => e.name), ['weather', 'writer']);
  assert.deepEqual(matchCommands(catalog, '@', 'story').map((e) => e.name), ['writer']);
});

test('parse: commands, tools with args and missing required args, choices, agents, text, unknown', () => {
  assert.equal(parseComposerInput('/res', catalog).kind, 'command');
  const tool = parseComposerInput('/search_knowledge cats and dogs', catalog) as any;
  assert.equal(tool.kind, 'tool');
  assert.deepEqual(tool.args, { query: 'cats', limit: 'and' }, 'positional by schema (existing CLI behaviour; the server validates)');
  assert.deepEqual((parseComposerInput('/save_note buy milk and eggs', catalog) as any).args, { text: 'buy milk and eggs' }, 'the last string parameter takes the rest');
  const json = parseComposerInput('/search_knowledge {"query": "cats", "limit": 3}', catalog) as any;
  assert.deepEqual([json.args, json.missing], [{ query: 'cats', limit: 3 }, []]);
  assert.deepEqual((parseComposerInput('/save_note', catalog) as any).missing, ['text']);
  assert.equal(parseComposerInput('/1', catalog).kind, 'choice');
  assert.deepEqual(parseComposerInput('@weather is it raining in Tartu?', catalog), { kind: 'agent', name: 'weather', entry: catalog[4], message: 'is it raining in Tartu?' });
  assert.deepEqual(parseComposerInput('hello there', catalog), { kind: 'text', text: 'hello there' });
  assert.deepEqual(parseComposerInput('/nope x', catalog), { kind: 'unknown', trigger: '/', name: 'nope' });
  assert.deepEqual(parseComposerInput('@nobody hi', catalog), { kind: 'unknown', trigger: '@', name: 'nobody' });
  assert.deepEqual(missingToolArgs(catalog[1].parameters, toolArgsFromTokens([], catalog[1].parameters)), ['query']);
});

test('CLI: catalog, tab completion and @agent routing', async () => {
  const sent: any[] = [];
  const shell = createClientShell({
    tools: [{ name: 'search_knowledge', description: 'Search' }],
    agents: ['weather', 'writer'],
    onAgentMessage: async (agent: string, message: string) => { sent.push([agent, message]); },
  } as any);
  const catalogNames = shell.commandCatalog().map((e: any) => `${e.source}:${e.name}`);
  assert.ok(catalogNames.includes('tool:search_knowledge') && catalogNames.includes('agent:weather') && catalogNames.includes('command:help'));
  assert.deepEqual(completeLine(shell.commandCatalog(), '/sea'), [['/search_knowledge'], '/sea']);
  assert.deepEqual(completeLine(shell.commandCatalog(), 'hey @wr'), [['@writer'], '@wr']);

  await shell.handleLine('@weather rain today?');
  assert.deepEqual(sent, [['weather', 'rain today?']]);
  const log = console.log; const lines: string[] = []; console.log = (...a: any[]) => lines.push(a.join(' '));
  try {
    await shell.handleLine('@nobody hi');
  } finally {
    console.log = log;
  }
  assert.match(lines.join('\n'), /Unknown agent @nobody/);
});
