import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst, snapshotDb, assertGolden } from '../helpers/harness.ts';

const modules = {
  sequential: () => import('../fixtures/ast/sequential.ts'),
  parallel: () => import('../fixtures/ast/parallel.ts'),
  graph: () => import('../fixtures/ast/graph.ts'),
  router: () => import('../fixtures/ast/router.ts'),
  human_input: () => import('../fixtures/ast/human_input.ts'),
};

async function load(name: keyof typeof modules) {
  return (await modules[name]()).run();
}

// Responses of script nodes, order-independent (parallel children have no defined order).
const contents = (snap: any) => snap.responses.map((r: any) => String(r.content));

for (const name of ['sequential', 'parallel', 'router', 'graph'] as const) {
  test(`ast/${name}: runs to completion with deterministic DB state`, async () => {
    const env = await createEnv(`ast_${name}`);
    try {
      const { requestId, result } = await runAst(env, await load(name));
      assert.equal(result.done, true);
      const root = await env.prisma.request.findUnique({ where: { id: requestId } });
      assert.equal(root.status, 'COMPLETED');

      const snap = await snapshotDb(env);
      assert.ok(snap.requests.every((r: any) => r.status === 'COMPLETED'), 'every spawned request completed');
      assertGolden(`ast/${name}.db.json`, snap);
    } finally {
      await env.cleanup();
    }
  });
}

test('ast/router: takes the branch returned by the router script', async () => {
  const env = await createEnv('ast_router_branch');
  try {
    await runAst(env, await load('router'));
    const all = contents(await snapshotDb(env)).join('\n');
    assert.match(all, /took B/);
    assert.doesNotMatch(all, /took A/);
  } finally {
    await env.cleanup();
  }
});

test('ast/human_input: parks for input, resumes with the supplied value', async () => {
  const env = await createEnv('ast_human', { echo: (a: any) => ({ echoed: a.text }) });
  try {
    const { result } = await runAst(env, await load('human_input'));
    assert.equal(result.waiting, true);
    assert.equal(result.waitEvent, 'curator:choice');
    assert.equal(env.calls.length, 0);

    await env.processor.emitEventRequest({
      eventName: 'curator:choice',
      payload: 'CODE-42',
      conversationId: env.conversationId,
      userId: env.userId,
      origin: 'API',
    });
    const resumed = await env.processor.stepUntil({ conversationId: env.conversationId });
    assert.equal(resumed.done, true);
    assert.deepEqual(env.calls.map((c) => c.args.text), ['CODE-42']);
    assertGolden('ast/human_input.db.json', await snapshotDb(env));
  } finally {
    await env.cleanup();
  }
});
