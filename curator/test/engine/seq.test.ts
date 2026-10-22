import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, compileFixture, runAst, snapshotDb, assertGolden } from '../helpers/harness.ts';

test('seq_set_state: executes tools in order and leaves deterministic DB state', async () => {
  const env = await createEnv('seq', { echo: (a) => ({ echoed: a.text }) });
  try {
    const ast = await compileFixture('seq_set_state.coffee');
    const { requestId, result } = await runAst(env, ast);

    assert.equal(result.done, true);
    assert.deepEqual(env.calls, [{ tool: 'echo', args: { text: 'hello' } }]);

    const root = await env.prisma.request.findUnique({ where: { id: requestId } });
    assert.equal(root.status, 'COMPLETED');

    assertGolden('seq_set_state.db.json', await snapshotDb(env));
  } finally {
    await env.cleanup();
  }
});

test('seq_set_state: two independent runs produce identical snapshots', async () => {
  const snaps: unknown[] = [];
  for (const name of ['run_a', 'run_b']) {
    const env = await createEnv(name, { echo: (a) => ({ echoed: a.text }) });
    try {
      await runAst(env, await compileFixture('seq_set_state.coffee'));
      snaps.push(await snapshotDb(env));
    } finally {
      await env.cleanup();
    }
  }
  assert.deepEqual(snaps[0], snaps[1]);
});
