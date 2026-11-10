import test from 'node:test';
import assert from 'node:assert/strict';
import { ref } from 'vue';
import { parseComposerInput } from '@curator/host/contracts';
import { usePromptLibrary, mcpPromptText } from '../src/composables/usePromptLibrary.ts';
import { useCommandCatalog, isCommandAllowed } from '../src/composables/useCommandCatalog.ts';

const tools = (names: string[]) => ref(names.map((name) => ({ name })));

test('prompt library: saved and MCP prompts become / entries; rendering uses the matching tool', async () => {
  const calls: any[] = [];
  const run = async (name: string, args: any) => {
    calls.push({ name, args });
    if (name === 'prompt_list') return { prompts: [{ name: 'summary', title: 'Summary', arguments: [{ name: 'topic', required: true }] }] };
    if (name === 'mcp_prompts_list') return [{ server: 'docs', name: 'summary' }, { server: 'docs', name: 'review' }];
    if (name === 'prompt_get') return { text: `Summarize ${args.arguments.topic}` };
    if (name === 'mcp_prompt_get') return { messages: [{ role: 'user', content: { type: 'text', text: 'Review it' } }] };
    return null;
  };
  const lib = usePromptLibrary(tools(['prompt_list', 'prompt_get', 'mcp_prompts_list', 'mcp_prompt_get']), run);
  await lib.load();
  assert.deepEqual(lib.entries.value.map((e) => e.name), ['summary', 'docs.summary', 'review']);

  const catalog = useCommandCatalog({ tools: ref([]), agents: ref([]), choices: ref([]), prompts: lib.entries });
  const parsed: any = parseComposerInput('/summary roles', catalog.catalog.value);
  assert.equal(parsed.kind, 'prompt');
  assert.equal(await lib.render(parsed.entry, parsed.args), 'Summarize roles');
  assert.deepEqual((parseComposerInput('/summary', catalog.catalog.value) as any).missing, ['topic']);
  const review = lib.entries.value.find((e) => e.name === 'review')!;
  assert.equal(await lib.render(review, {}), 'Review it');
  assert.deepEqual(calls.at(-1), { name: 'mcp_prompt_get', args: { server: 'docs', name: 'review', arguments: {} } });
});

test('prompt library: sources the user may not use are skipped; /save-prompt needs prompt_save', async () => {
  const lib = usePromptLibrary(tools(['prompt_list']), async () => ({ prompts: [{ name: 'x' }] }));
  await lib.load();
  assert.deepEqual(lib.entries.value, []);
  assert.equal(isCommandAllowed('save-prompt', [], ['prompt_list']), false);
  assert.equal(isCommandAllowed('save-prompt', [], ['prompt_save']), true);
  assert.equal(mcpPromptText({ messages: [{ content: 'a' }, { content: { type: 'text', text: 'b' } }] }), 'a\n\nb');
});
