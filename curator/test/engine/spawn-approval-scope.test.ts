import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst, runScript, saveScript, snapshotDb, assertGolden, FIXED_NOW } from '../helpers/harness.ts';
import { hashAst } from '../../src/engine/ScriptRegistry.js';

const tool = (name: string, args: any = {}, extra: any = {}) => ({ type: 'Curator_Tool', toolName: name, args, ...extra });

function requireApproval(env: any, name: string) {
  const t = env.processor.engine.tools.get(name);
  t.requiresHumanApproval = true;
  t.requiresConfirmation = true;
}

// ---- Spawn ----

test('spawn: a script returning an AST runs it as a child and completes the parent', async () => {
  const env = await createEnv('spawn', { ping: () => 'pong' });
  try {
    const child = { type: 'Curator_Tool', toolName: 'ping', args: {} };
    const { requestId, result } = await runAst(env, {
      type: 'Curator_Script',
      language: 'javascript',
      code: `(${JSON.stringify(child)})`,
    });
    assert.equal(result.done, true);
    assert.equal(env.calls.length, 1);
    const root = await env.prisma.request.findUnique({ where: { id: requestId } });
    assert.equal(root.status, 'COMPLETED');
    const snap = await snapshotDb(env);
    assert.equal(snap.requests.length, 2);
    assertGolden('spawn/spawn.db.json', snap);
  } finally {
    await env.cleanup();
  }
});

// ---- Approval pauses ----

test('approval: a confirmation tool parks WAITING_FOR_USER and does not run', async () => {
  const env = await createEnv('appr_park', { danger: () => 'done' });
  try {
    requireApproval(env, 'danger');
    const { requestId, result } = await runAst(env, tool('danger', { x: 1 }));
    assert.equal(result.waiting, true);
    assert.equal(env.calls.length, 0);
    const req = await env.prisma.request.findUnique({ where: { id: requestId } });
    assert.equal(req.status, 'WAITING_FOR_USER');
    assert.equal(req.context.pendingToolCall.name, 'danger');
    const responses = await env.prisma.response.findMany({ where: { requestId } });
    assert.match(responses[0].content, /APPROVAL_REQUIRED/);
  } finally {
    await env.cleanup();
  }
});

test('approval: granting one-time approval resumes and runs the tool', async () => {
  const env = await createEnv('appr_grant', { danger: () => 'done' });
  try {
    requireApproval(env, 'danger');
    const { requestId } = await runAst(env, tool('danger', { x: 1 }));
    const parked = await env.prisma.request.findUnique({ where: { id: requestId } });
    // Same mutation the server's approveRequest resolver performs.
    await env.prisma.request.update({
      where: { id: requestId },
      data: { status: 'NEW', context: { ...parked.context, __humanApproved__: true }, lockedBy: null, lockedAt: null },
    });
    const resumed = await env.processor.stepUntil({ conversationId: env.conversationId });
    assert.equal(resumed.done, true);
    assert.equal(env.calls.length, 1);
    const req = await env.prisma.request.findUnique({ where: { id: requestId } });
    assert.equal(req.status, 'COMPLETED');
  } finally {
    await env.cleanup();
  }
});

for (const mode of ['fail', 'continue'] as const) {
  test(`approval: expiry with onApprovalExpired='${mode}' closes the wait`, async () => {
    let now = FIXED_NOW;
    const env = await createEnv('appr_expire_' + mode, { danger: () => 'done' }, { now: () => now, approvalTtlMs: 1000 });
    try {
      requireApproval(env, 'danger');
      const { requestId } = await runAst(env, tool('danger', {}, { onApprovalExpired: mode }));
      now += 5000;
      await (env.processor as any).expireApprovalWaits();
      const req = await env.prisma.request.findUnique({ where: { id: requestId } });
      assert.equal(req.status, mode === 'continue' ? 'COMPLETED' : 'FAILED');
      assert.equal(env.calls.length, 0);
      const responses = await env.prisma.response.findMany({ where: { requestId } });
      assert.ok(responses.some((r: any) => /APPROVAL_EXPIRED/.test(r.content)));
    } finally {
      await env.cleanup();
    }
  });
}

// ---- Project scoping ----

test('scoping: project-scoped role is denied outside its project, allowed inside it', async () => {
  const env = await createEnv('scope', { ping: () => 'pong' });
  try {
    // Replace the harness's global admin with a role that only applies in project p1.
    await env.prisma.userRole.deleteMany({ where: { userId: env.userId } });
    await env.prisma.project.create({ data: { id: 'p1', name: 'P1', userId: env.userId } });
    await env.prisma.userRole.create({ data: { userId: env.userId, roleId: 'admin', projectId: 'p1' } });

    const outside = await runAst(env, tool('ping'));
    const outsideReq = await env.prisma.request.findUnique({ where: { id: outside.requestId } });
    assert.equal(outsideReq.status, 'FAILED');
    assert.equal(env.calls.length, 0);

    const inside = await env.prisma.request.create({
      data: {
        userId: env.userId,
        conversationId: env.conversationId,
        projectId: 'p1',
        status: 'NEW',
        toolName: 'Curator_Workflow',
        ast: tool('ping'),
      },
    });
    await env.processor.stepUntil({ conversationId: env.conversationId });
    const insideReq = await env.prisma.request.findUnique({ where: { id: inside.id } });
    assert.equal(insideReq.status, 'COMPLETED');
    assert.equal(env.calls.length, 1);
  } finally {
    await env.cleanup();
  }
});

test('scoping: child requests inherit the parent projectId', async () => {
  const env = await createEnv('scope_child', { ping: () => 'pong' });
  try {
    await env.prisma.project.create({ data: { id: 'p2', name: 'P2', userId: env.userId } });
    await env.prisma.userRole.deleteMany({ where: { userId: env.userId } });
    await env.prisma.userRole.create({ data: { userId: env.userId, roleId: 'admin', projectId: 'p2' } });
    await env.prisma.request.create({
      data: {
        userId: env.userId,
        conversationId: env.conversationId,
        projectId: 'p2',
        status: 'NEW',
        toolName: 'Curator_Workflow',
        ast: { type: 'Curator_Parallel', name: 'par', subAgents: [tool('ping'), tool('ping')] },
      },
    });
    await env.processor.stepUntil({ conversationId: env.conversationId });
    const all = await env.prisma.request.findMany({ where: { conversationId: env.conversationId } });
    assert.ok(all.length >= 3);
    assert.ok(all.every((r: any) => r.projectId === 'p2'));
  } finally {
    await env.cleanup();
  }
});

// ---- Hash idempotency ----

test('idempotency: same AST is not re-versioned; changed AST bumps; old AST re-activates', async () => {
  const env = await createEnv('idem', { ping: () => 'pong' });
  try {
    const a = tool('ping', { n: 1 });
    const b = tool('ping', { n: 2 });
    const first = await saveScript(env, 'idem_script', a);
    assert.equal(first.created, true);
    assert.equal(first.version, 1);

    const again = await saveScript(env, 'idem_script', { ...a, args: { n: 1 } });
    assert.equal(again.created, false);
    assert.equal(again.version, 1);
    assert.equal(again.hash, first.hash);

    const changed = await saveScript(env, 'idem_script', b);
    assert.equal(changed.created, true);
    assert.equal(changed.version, 2);

    const back = await saveScript(env, 'idem_script', a);
    assert.equal(back.created, false);
    assert.equal(back.version, 1);

    const script = await env.prisma.script.findUnique({ where: { id: first.scriptId } });
    assert.equal(script.currentVersion, 1);
    assert.equal(await env.prisma.scriptVersion.count({ where: { scriptId: first.scriptId } }), 2);
  } finally {
    await env.cleanup();
  }
});

test('idempotency: hash ignores key order and re-running a stored version gives equal effects', async () => {
  assert.equal(hashAst({ a: 1, b: { c: 2, d: 3 } }), hashAst({ b: { d: 3, c: 2 }, a: 1 }));

  const env = await createEnv('idem_run', { ping: () => 'pong' });
  try {
    const saved = await saveScript(env, 'idem_run', tool('ping', { n: 1 }));
    await runScript(env, saved.scriptId, saved.version);
    await runScript(env, saved.scriptId, saved.version);
    assert.equal(env.calls.length, 2);
    assert.deepEqual(env.calls[0], env.calls[1]);
  } finally {
    await env.cleanup();
  }
});
