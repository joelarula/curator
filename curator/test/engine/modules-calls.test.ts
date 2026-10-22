import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst, runScript, saveScript, snapshotDb, assertGolden } from '../helpers/harness.ts';

const tool = (name: string, args: any = {}, as?: string) => ({ type: 'Curator_Tool', toolName: name, args, ...(as ? { as } : {}) });

const greeterModule = () => ({
  type: 'Curator_Module',
  name: 'greeter',
  main: {
    type: 'Curator_Sequential',
    name: 'main',
    subAgents: [
      { type: 'Curator_Call', ref: '#double', args: { n: 21 }, as: 'result' },
      tool('record', { value: '$state.result' }),
    ],
  },
  subroutines: {
    double: {
      params: { n: { type: 'number' } },
      returns: '$state.doubled',
      body: {
        type: 'Curator_Sequential',
        name: 'doubleBody',
        subAgents: [
          { type: 'Curator_Assign', key: 'doubled', expression: '$params.n * 2' },
        ],
      },
    },
  },
});

const canned = { record: (a: any) => ({ got: a.value }) };

test('module: child call binds params, applies returns and assigns `as`', async () => {
  const env = await createEnv('mod_call', canned);
  try {
    const saved = await saveScript(env, 'greeter', greeterModule());
    const { requestId, result } = await runScript(env, saved.scriptId, saved.version);
    assert.equal(result.done, true);
    const root = await env.prisma.request.findUnique({ where: { id: requestId } });
    assert.equal(root.status, 'COMPLETED');
    assert.deepEqual(env.calls.map((c) => c.args.value), [42]);

    const snap = await snapshotDb(env);
    assert.ok(snap.requests.every((r: any) => r.status === 'COMPLETED'));
    assertGolden('modules/call_child.db.json', snap);
  } finally {
    await env.cleanup();
  }
});

test('module: inline call produces the same tool effect without a child request', async () => {
  const env = await createEnv('mod_inline', canned);
  try {
    const mod: any = greeterModule();
    mod.main.subAgents[0].mode = 'inline';
    const saved = await saveScript(env, 'greeter_inline', mod);
    const { result } = await runScript(env, saved.scriptId, saved.version);
    assert.equal(result.done, true);
    assert.deepEqual(env.calls.map((c) => c.args.value), [42]);
    const requests = await env.prisma.request.findMany({ where: { conversationId: env.conversationId } });
    assert.ok(requests.every((r: any) => r.status === 'COMPLETED'));
  } finally {
    await env.cleanup();
  }
});

test('module: call to a missing script fails the caller with a clear error', async () => {
  const env = await createEnv('mod_missing', canned);
  try {
    const { requestId } = await runAst(env, { type: 'Curator_Call', ref: 'does_not_exist' });
    const root = await env.prisma.request.findUnique({ where: { id: requestId } });
    assert.equal(root.status, 'FAILED');
    const responses = await env.prisma.response.findMany({ where: { requestId } });
    assert.match(responses.map((r: any) => r.content).join('\n'), /does_not_exist/);
  } finally {
    await env.cleanup();
  }
});

test('module: recursion beyond maxCallDepth fails instead of looping', async () => {
  const env = await createEnv('mod_depth', canned, { maxCallDepth: 3 });
  try {
    const mod = {
      type: 'Curator_Module',
      name: 'loop',
      main: { type: 'Curator_Call', ref: '#again' },
      subroutines: { again: { body: { type: 'Curator_Call', ref: '#again' } } },
    };
    const saved = await saveScript(env, 'loop', mod);
    await runScript(env, saved.scriptId, saved.version);
    const responses = await env.prisma.response.findMany({ where: { conversationId: env.conversationId } });
    assert.match(responses.map((r: any) => r.content).join('\n'), /maxCallDepth/);
  } finally {
    await env.cleanup();
  }
});
