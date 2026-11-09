import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst } from '../helpers/harness.ts';
import { GuardrailService } from '../../src/services/GuardrailService.ts';

const agent = (extra: any = {}) => ({ type: 'Curator_Agent', agentName: 'helper', model: 'fake-model', prompt: 'hello', ...extra });
const responses = async (env: any) => (await env.prisma.response.findMany({ orderBy: { id: 'asc' } })).map((r: any) => r.content);

test('guardrail hooks: inlet rewrites the request but cannot add tools or change the model', async () => {
  const env = await createEnv('gh_inlet', { lookup: () => 'ok' });
  const off = GuardrailService.registerProvider({
    name: 'rewriter',
    inlet: (req) => ({ ...req, systemPrompt: `${req.systemPrompt ?? ''}[policy]`, model: 'other-model', tools: [...(req.tools ?? []), { name: 'shell', description: 'x', parameters: {} }] }),
  });
  try {
    const llm = env.useLlm(['fine']);
    await runAst(env, agent({ instruction: 'be brief', tools: ['lookup'] }));
    assert.equal(llm.requests[0].systemPrompt, 'be brief[policy]');
    assert.equal(llm.requests[0].model, 'fake-model', 'model restored');
    assert.deepEqual(llm.requests[0].tools?.map((t) => t.name), ['lookup'], 'added tool dropped');
  } finally {
    off();
    await env.cleanup();
  }
});

test('guardrail hooks: an inlet block (or a failing hook) records GUARDRAIL_BLOCKED and skips the model', async () => {
  for (const [name, inlet] of [
    ['blocker', () => ({ blocked: true as const, reason: 'off-topic' })],
    ['crasher', () => { throw new Error('boom'); }],
  ] as const) {
    const env = await createEnv(`gh_block_${name}`);
    const off = GuardrailService.registerProvider({ name, inlet: inlet as any });
    try {
      const llm = env.useLlm(['never']);
      await runAst(env, agent());
      assert.equal(llm.requests.length, 0);
      const record = JSON.parse((await responses(env)).at(-1));
      assert.equal(record.type, 'GUARDRAIL_BLOCKED');
      assert.equal(record.metadata.provider, name);
      assert.equal(record.metadata.stage, 'inlet');
      assert.match(record.reason, name === 'blocker' ? /off-topic/ : /failed: boom/);
    } finally {
      off();
      await env.cleanup();
    }
  }
});

test('guardrail hooks: outlet rewrites text and cannot add tool calls; egress providers run before masking', async () => {
  const env = await createEnv('gh_outlet', { lookup: () => 'ok' });
  const offOut = GuardrailService.registerProvider({
    name: 'outlet',
    outlet: (res) => ({ ...res, text: res.text.replace('darn', '****'), toolCalls: [...(res.toolCalls ?? []), { id: 'x', name: 'lookup', args: {} }] }),
  });
  const offEg = GuardrailService.registerProvider({ name: 'egress', sanitizeEgress: async (t) => `${t} (reviewed)` });
  try {
    env.useLlm(['darn it']);
    await runAst(env, agent({ tools: ['lookup'] }));
    assert.deepEqual(env.calls, [], 'the added tool call did not run');
    assert.equal((await responses(env)).at(-1), '**** it (reviewed)');
  } finally {
    offOut();
    offEg();
    await env.cleanup();
  }
});

test('guardrail hooks: priority order and appliesTo', () => {
  const offs = [
    GuardrailService.registerProvider({ name: 'late', priority: 200, inlet: () => undefined }),
    GuardrailService.registerProvider({ name: 'early', priority: 10, inlet: () => undefined }),
    GuardrailService.registerProvider({ name: 'only-support', appliesTo: ['support_*'], inlet: () => undefined }),
  ];
  try {
    assert.deepEqual(GuardrailService.providersFor('helper').map((p) => p.name).filter((n) => ['late', 'early', 'only-support'].includes(n)), ['early', 'late']);
    assert.deepEqual(GuardrailService.providersFor('support_bot').map((p) => p.name).filter((n) => ['late', 'early', 'only-support'].includes(n)), ['early', 'only-support', 'late']);
  } finally {
    offs.forEach((off) => off());
  }
});
