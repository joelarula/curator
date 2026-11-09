import test from 'node:test';
import assert from 'node:assert/strict';
import { describeAgent, entryAgentNode } from '../../src/engine/agentCatalog.ts';
import { llmCapabilities, DEFAULT_LLM_CAPABILITIES } from '../../src/engine/llm/ILlmProvider.ts';

const fakeProviders: Record<string, any> = {
  gemini: { providerName: 'gemini', capabilities: { vision: true }, capabilitiesFor: (m?: string) => (m === 'text-only' ? { vision: false } : undefined), generateContent: async () => ({ text: '' }) },
  'openai-compatible': { providerName: 'openai-compatible', capabilities: { tools: 'prompt' }, generateContent: async () => ({ text: '' }) },
};
const getProvider = (name?: string, baseUrl?: string) => (baseUrl || name === 'local' ? fakeProviders['openai-compatible'] : fakeProviders[name ?? 'gemini'] ?? fakeProviders.gemini);

test('capabilities: defaults < provider < model', () => {
  assert.deepEqual(llmCapabilities(undefined), { ...DEFAULT_LLM_CAPABILITIES });
  assert.equal(llmCapabilities(fakeProviders.gemini as any).vision, true);
  assert.equal(llmCapabilities(fakeProviders.gemini as any, 'text-only').vision, false);
  assert.equal(llmCapabilities({ providerName: 'x', embedContent: async () => ({}) } as any).embeddings, true);
});

test('describeAgent: presentation falls back to description and name; capabilities of the entry agent node', () => {
  const ast = {
    type: 'Curator_Sequential',
    subAgents: [
      { type: 'Curator_Tool', toolName: 'prep' },
      { type: 'Curator_Agent', agentName: 'talker', model: 'text-only', tools: ['lookup'] },
      { type: 'Curator_Agent', agentName: 'second', provider: 'local' },
    ],
  };
  assert.equal(entryAgentNode(ast)?.agentName, 'talker');
  assert.equal(entryAgentNode(JSON.stringify(ast))?.agentName, 'talker', 'stored ASTs may be JSON text');

  const entry = describeAgent('helper', { description: 'Helps', ast, presentation: { title: 'Helper', icon: 'mdi-robot', starterPrompts: ['Hi', ' ', 'Help me'] } }, getProvider);
  assert.deepEqual([entry.title, entry.description, entry.icon, entry.starterPrompts], ['Helper', 'Helps', 'mdi-robot', ['Hi', 'Help me']]);
  assert.deepEqual(
    { provider: entry.capabilities?.provider, model: entry.capabilities?.model, vision: entry.capabilities?.vision, tools: entry.capabilities?.tools, dynamic: entry.capabilities?.dynamic },
    { provider: 'gemini', model: 'text-only', vision: false, tools: 'native', dynamic: false }
  );

  const local = describeAgent('local', { ast: { type: 'Curator_Agent', provider: 'local' } }, getProvider);
  assert.deepEqual([local.title, local.capabilities?.provider, local.capabilities?.tools], ['local', 'openai-compatible', 'none'], 'no tools offered → none');

  const dynamic = describeAgent('dyn', { ast: { type: 'Curator_Agent', model: '$config.app.model', tools: ['x'] } }, getProvider);
  assert.equal(dynamic.capabilities?.dynamic, true);
  assert.equal(describeAgent('tools-only', { ast: { type: 'Curator_Tool', toolName: 'x' } }).capabilities, null);
});
