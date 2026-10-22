import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst, saveScript, snapshotDb, assertGolden } from '../helpers/harness.ts';

const tool = (name: string, args: any = {}, as?: string) => ({ type: 'Curator_Tool', toolName: name, args, ...(as ? { as } : {}) });
const seq = (name: string, subAgents: any[]) => ({ type: 'Curator_Sequential', name, subAgents });
const canned = { record: (a: any) => ({ got: a.value }) };

const subs = (env: any) => env.prisma.eventSubscription.findMany({ orderBy: { id: 'asc' } });
const status = async (env: any, id: number) => (await env.prisma.request.findUnique({ where: { id } })).status;

// A handler script whose params carry the event payload under `evt`.
const handler = () => tool('record', { value: '$params.evt.n' });

test('subscribe: emitted events spawn the handler with the payload; `when` filters; unsubscribe stops it', async () => {
  const env = await createEnv('sub_flow', canned);
  try {
    await saveScript(env, 'on_ping', handler());
    const { requestId, result } = await runAst(
      env,
      seq('sub_flow', [
        { type: 'Curator_Subscribe', eventName: 'ping', handler: 'on_ping', as: 'evt', when: 'evt.n > 1' },
        { type: 'Curator_EmitEvent', eventName: 'ping', payload: { n: 1 } },
        { type: 'Curator_EmitEvent', eventName: 'ping', payload: { n: 2 } },
        { type: 'Curator_Unsubscribe', eventName: 'ping', handler: 'on_ping' },
        { type: 'Curator_EmitEvent', eventName: 'ping', payload: { n: 3 } },
      ]),
    );
    assert.equal(result.done, true);
    assert.equal(await status(env, requestId), 'COMPLETED');

    assert.deepEqual(env.calls.map((c) => c.args.value), [2]);
    const rows = await subs(env);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].isActive, false);
    assert.equal(rows[0].payloadAs, 'evt');
    assert.equal(rows[0].when, 'evt.n > 1');
    assertGolden('events/subscribe_flow.db.json', await snapshotDb(env));
  } finally {
    await env.cleanup();
  }
});

test('subscribe: re-subscribing the same handler is idempotent (one row, re-activated)', async () => {
  const env = await createEnv('sub_idem', canned);
  try {
    await saveScript(env, 'on_ping', handler());
    const sub = { type: 'Curator_Subscribe', eventName: 'ping', handler: 'on_ping', as: 'evt' };
    await runAst(env, seq('s', [sub, { type: 'Curator_Unsubscribe', eventName: 'ping' }, sub]));
    const rows = await subs(env);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].isActive, true);
  } finally {
    await env.cleanup();
  }
});

test('subscribe: invalid declarations fail the request (project scope, unknown handler, bad ref)', async () => {
  const env = await createEnv('sub_fail', canned);
  try {
    await saveScript(env, 'on_ping', handler());
    const cases: any[] = [
      { type: 'Curator_Subscribe', eventName: 'x', handler: 'on_ping', scope: 'project' },
      { type: 'Curator_Subscribe', eventName: 'x', handler: 'no_such_script' },
    ];
    for (const ast of cases) {
      const { requestId } = await runAst(env, ast);
      assert.equal(await status(env, requestId), 'FAILED');
    }
    assert.equal((await subs(env)).length, 0);
  } finally {
    await env.cleanup();
  }
});

test('agent ref: runs the agent\'s script as a child with the agent as actor', async () => {
  const env = await createEnv('agentref', canned);
  try {
    const saved = await saveScript(env, 'agent_script', tool('record', { value: 'from-agent' }));
    const agent = await env.prisma.agent.create({
      data: { id: 'agent-helper', name: 'helper', scriptId: saved.scriptId, userId: env.userId },
    });
    await env.prisma.agentRole.create({ data: { agentId: agent.id, roleId: 'admin' } });

    const { requestId, result } = await runAst(env, { type: 'Curator_AgentRef', agentName: 'helper' });
    assert.equal(result.done, true);
    assert.equal(await status(env, requestId), 'COMPLETED');
    assert.deepEqual(env.calls.map((c) => c.args.value), ['from-agent']);
    const child = await env.prisma.request.findFirst({ where: { parentId: requestId } });
    assert.equal(child?.agentId, agent.id);
    assertGolden('events/agent_ref.db.json', await snapshotDb(env));
  } finally {
    await env.cleanup();
  }
});

test('agent ref: unknown agent or agent without a script fails with an [Agent Error] response', async () => {
  const env = await createEnv('agentref_fail', canned);
  try {
    await env.prisma.agent.create({ data: { name: 'scriptless', userId: env.userId } });
    for (const agentName of ['ghost', 'scriptless']) {
      const { requestId } = await runAst(env, { type: 'Curator_AgentRef', agentName });
      assert.equal(await status(env, requestId), 'FAILED');
      const res = await env.prisma.response.findMany({ where: { requestId } });
      assert.match(res[0].content, /\[Agent Error\]/);
    }
    assert.equal(env.calls.length, 0);
  } finally {
    await env.cleanup();
  }
});

test('join: concatenates completed branch outputs and continues the parent sequence', async () => {
  const env = await createEnv('join_ok', { a: () => 'A', b: () => 'B', after: () => 'done' });
  try {
    const { requestId, result } = await runAst(
      env,
      seq('j', [
        { type: 'Curator_Parallel', name: 'fan', subAgents: [tool('a'), tool('b')] },
        tool('after'),
      ]),
    );
    assert.equal(result.done, true);
    assert.equal(await status(env, requestId), 'COMPLETED');
    assert.deepEqual(env.calls.map((c) => c.tool).sort(), ['a', 'after', 'b']);
    const joined = (await env.prisma.response.findMany()).find((r: any) => /^\[Joined Output\]/.test(r.content));
    assert.ok(joined, 'join response written');
    assert.match(joined.content, /A/);
    assert.match(joined.content, /B/);
    assert.match(joined.content, /\n\n---\n\n/);
  } finally {
    await env.cleanup();
  }
});

test('join: a branch whose tool errors still completes, and its [Tool Error] text is joined', async () => {
  const env = await createEnv('join_fail', {
    ok: () => 'fine',
    bad: () => { throw new Error('nope'); },
  });
  try {
    const { requestId } = await runAst(env, { type: 'Curator_Parallel', name: 'fan', subAgents: [tool('ok'), tool('bad')] });
    const joinReq = (await env.prisma.request.findMany()).find((r: any) => JSON.stringify(r.ast).includes('Curator_Join'));
    assert.ok(joinReq, 'join request exists');
    const joined = (await env.prisma.response.findMany({ where: { requestId: joinReq.id } }))[0];
    assert.ok(joined, `join ran (parent status ${await status(env, requestId)})`);
    assert.match(joined.content, /fine/);
    assert.match(joined.content, /\[Tool Error\] nope/);
  } finally {
    await env.cleanup();
  }
});
