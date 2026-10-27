import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst } from '../helpers/harness.ts';
import { listDeadLetters, replayDeadLetter } from '../../src/engine/DeadLetters.ts';

const tool = (name: string, args: any = {}) => ({ type: 'Curator_Tool', toolName: name, args });
const seq = (name: string, subAgents: any[]) => ({ type: 'Curator_Sequential', name, subAgents });

const statuses = async (env: any) =>
  (await env.prisma.request.findMany({ where: { conversationId: env.conversationId }, orderBy: { id: 'asc' } })).map((r: any) => r.status);

test('dead letters: a failing step poisons the steps waiting on it instead of running them', async () => {
  const env = await createEnv('dl_seq', {
    fine: () => 'ok',
  });
  try {
    // missing_tool causes step to throw in handleTool and completeRequest with FAILED
    await runAst(env, seq('s', [tool('missing_tool'), tool('fine')]));
    assert.equal(env.calls.filter((c) => c.tool === 'fine').length, 0, 'the downstream step never ran on bad input');
    assert.ok(!(await statuses(env)).some((s: string) => s === 'NEW' || s === 'WAITING'), 'nothing is left parked');

    const dead = await listDeadLetters(env.prisma, { conversationId: env.conversationId });
    const kinds = dead.map((d: any) => d.kind);
    assert.deepEqual(kinds, ['FAILED', 'FAILED']);
    assert.ok(dead.some((d: any) => /not found in dynamic registry/.test(d.reason)));
    assert.ok(dead.some((d: any) => /upstream request \d+ FAILED/.test(d.reason)));
  } finally {
    await env.cleanup();
  }
});

test('dead letters: an invalid request is dead-lettered with its definition', async () => {
  const env = await createEnv('dl_invalid');
  try {
    await runAst(env, { type: 'Curator_Bogus' });
    const [letter] = await listDeadLetters(env.prisma, { conversationId: env.conversationId });
    assert.equal(letter.kind, 'FAILED');
    assert.match(letter.reason, /Invalid Curator AST/);
    assert.equal(letter.ast.type, 'Curator_Bogus');
  } finally {
    await env.cleanup();
  }
});

test('dead letters: a Join completes even when upstream branches fail', async () => {
  const env = await createEnv('dl_join', {
    fine: () => 'ok',
  });
  try {
    await runAst(env, { type: 'Curator_Parallel', name: 'p', subAgents: [tool('missing_tool'), tool('fine')] });
    const all = await env.prisma.request.findMany({ where: { conversationId: env.conversationId } });
    const join = all.find((r: any) => r.ast?.type === 'Curator_Join');
    assert.ok(join, 'join exists');
    assert.equal(join.status, 'COMPLETED', 'the join was not left waiting for the dead branch');
    const dead = await listDeadLetters(env.prisma, { conversationId: env.conversationId });
    assert.equal(dead.length, 1);
    assert.match(dead[0].reason, /not found in dynamic registry/);
  } finally {
    await env.cleanup();
  }
});

test('dead letters: a dead request cancels its live children (poison pill)', async () => {
  const env = await createEnv('dl_orphans');
  try {
    const p = env.prisma;
    const base = { userId: env.userId, conversationId: env.conversationId };
    const parent = await p.request.create({ data: { ...base, status: 'WAITING', ast: tool('x') } });
    const child = await p.request.create({ data: { ...base, status: 'WAITING', parentId: parent.id, ast: tool('x') } });
    const grandchild = await p.request.create({ data: { ...base, status: 'NEW', parentId: child.id, pendingDependencies: 1, ast: tool('x') } });

    await (env.processor as any).completeRequest(parent.id, 'FAILED');

    const status = async (id: number) => (await p.request.findUnique({ where: { id } })).status;
    assert.equal(await status(child.id), 'CANCELLED');
    assert.equal(await status(grandchild.id), 'CANCELLED');
    const dead = await listDeadLetters(env.prisma, { conversationId: env.conversationId });
    assert.deepEqual(dead.map((d: any) => d.kind), ['FAILED', 'CANCELLED', 'CANCELLED']);
  } finally {
    await env.cleanup();
  }
});

test('dead letters: replay resubmits the request and marks the letter replayed', async () => {
  const env = await createEnv('dl_replay', {
    fine: () => 'ok',
  });
  try {
    // Initially run tool with missing name which fails
    const { requestId } = await runAst(env, tool('missing_tool'));
    const [letter] = await listDeadLetters(env.prisma, { conversationId: env.conversationId });
    assert.equal(letter.requestId, requestId);
    assert.equal(letter.replayed, false);

    // Update the request's AST to a registered tool before replay
    await env.prisma.request.update({
      where: { id: requestId },
      data: { ast: tool('fine') },
    });

    const revivedId = await replayDeadLetter(env.prisma, letter.requestId);
    await env.processor.stepUntil({ conversationId: env.conversationId });

    assert.equal((await env.prisma.request.findUnique({ where: { id: revivedId } })).status, 'COMPLETED');
    const letters = await listDeadLetters(env.prisma, { conversationId: env.conversationId });
    const originalLetter = letters.find((l: any) => l.requestId === requestId);
    assert.equal(originalLetter?.replayed, true);
  } finally {
    await env.cleanup();
  }
});
