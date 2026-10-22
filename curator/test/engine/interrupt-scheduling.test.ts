import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, saveScript, runAst, snapshotDb, assertGolden, FIXED_NOW } from '../helpers/harness.ts';

const tool = (name: string, extra: any = {}) => ({ type: 'Curator_Tool', toolName: name, args: {}, ...extra });

async function enqueue(env: any, ast: any, priority = 0, extra: Record<string, any> = {}) {
  return env.prisma.request.create({
    data: { userId: env.userId, conversationId: env.conversationId, status: 'NEW', toolName: 'Curator_Workflow', ast, priority, ...extra },
  });
}

const statuses = async (env: any) =>
  (await env.prisma.request.findMany({ where: { conversationId: env.conversationId }, orderBy: { id: 'asc' } })).map((r: any) => r.status);

// stepUntil treats PAUSED as a wait gate; pause/play tests drive the poller-equivalent step() directly.
async function drain(env: any) {
  let n = 0;
  while ((await env.processor.step({ conversationId: env.conversationId })) > 0 && n++ < 100);
}

const canned = { low: () => 'low', handler: () => 'handled', after: () => 'after' };

// ---- Priorities ----

test('priority: higher-priority requests run first', async () => {
  const env = await createEnv('prio', canned, { maxConcurrency: 1 });
  try {
    await enqueue(env, tool('low'), 0);
    await enqueue(env, tool('handler'), 10);
    await enqueue(env, tool('after'), 5);
    await env.processor.stepUntil({ conversationId: env.conversationId });
    assert.deepEqual(env.calls.map((c) => c.tool), ['handler', 'after', 'low']);
  } finally {
    await env.cleanup();
  }
});

// ---- Interrupt: stop ----

test('interrupt stop: cancels lower-priority NEW requests and runs the handler', async () => {
  const env = await createEnv('int_stop', canned, { maxConcurrency: 1 });
  try {
    await enqueue(env, tool('low'), 0);
    await enqueue(env, tool('low'), 0);
    await enqueue(env, { type: 'Curator_Interrupt', mode: 'stop', priority: 50, handler: tool('handler') }, 50);
    const { done } = await env.processor.stepUntil({ conversationId: env.conversationId });
    assert.equal(done, true);
    assert.deepEqual(env.calls.map((c) => c.tool), ['handler']);
    const s = await statuses(env);
    assert.deepEqual(s.slice(0, 2), ['FAILED', 'FAILED']);
    assert.ok(s.slice(2).every((x: string) => x === 'COMPLETED'));
    assertGolden('interrupt/stop.db.json', await snapshotDb(env));
  } finally {
    await env.cleanup();
  }
});

test('interrupt stop: `resume` runs after the handler', async () => {
  const env = await createEnv('int_resume', canned, { maxConcurrency: 1 });
  try {
    await enqueue(env, tool('low'), 0);
    await enqueue(env, { type: 'Curator_Interrupt', mode: 'stop', priority: 50, handler: tool('handler'), resume: tool('after') }, 50);
    await env.processor.stepUntil({ conversationId: env.conversationId });
    assert.deepEqual(env.calls.map((c) => c.tool), ['handler', 'after']);
  } finally {
    await env.cleanup();
  }
});

// ---- Interrupt: pause / play ----

test('interrupt pause: freezes lower-priority work (PAUSED) after running the handler once', async () => {
  const env = await createEnv('int_pause', canned, { maxConcurrency: 1 });
  try {
    await enqueue(env, tool('low'), 0);
    await enqueue(env, tool('low'), 0);
    await enqueue(env, { type: 'Curator_Interrupt', mode: 'pause', priority: 50, handler: tool('handler') }, 50);
    await drain(env);
    assert.deepEqual(env.calls.map((c) => c.tool), ['handler'], 'handler ran exactly once, paused work did not');
    const s = await statuses(env);
    assert.deepEqual(s.slice(0, 2), ['PAUSED', 'PAUSED']);
  } finally {
    await env.cleanup();
  }
});

test('interrupt play: resumes paused work', async () => {
  const env = await createEnv('int_play', canned, { maxConcurrency: 1 });
  try {
    await enqueue(env, tool('low'), 0);
    await enqueue(env, { type: 'Curator_Interrupt', mode: 'pause', priority: 50 }, 50);
    await drain(env);
    assert.equal(env.calls.length, 0);
    assert.equal((await statuses(env))[0], 'PAUSED');

    await enqueue(env, { type: 'Curator_Interrupt', mode: 'play', priority: 50 }, 50);
    await drain(env);
    assert.deepEqual(env.calls.map((c) => c.tool), ['low']);
    assert.ok((await statuses(env)).every((x: string) => x === 'COMPLETED'));
    assertGolden('interrupt/pause_play.db.json', await snapshotDb(env));
  } finally {
    await env.cleanup();
  }
});

// ---- Scheduling (injected clock) ----

test('scheduledAt: a delayed step stays idle until the clock reaches it', async () => {
  let now = FIXED_NOW;
  const env = await createEnv('sched_delay', canned, { now: () => now });
  try {
    const { requestId } = await runAst(env, {
      type: 'Curator_Sequential',
      name: 'delayed',
      subAgents: [tool('low'), tool('after', { scheduledAt: 'in 2 minutes' })],
    });
    assert.deepEqual(env.calls.map((c) => c.tool), ['low']);
    let root = await env.prisma.request.findUnique({ where: { id: requestId } });
    const pending = await env.prisma.request.findMany({ where: { conversationId: env.conversationId, status: 'NEW' } });
    assert.equal(pending.length, 1);
    assert.equal(pending[0].scheduledAt.getTime(), FIXED_NOW + 120_000);

    now += 119_000;
    await env.processor.stepUntil({ conversationId: env.conversationId });
    assert.equal(env.calls.length, 1, 'not due yet');

    now += 1_000;
    const { done } = await env.processor.stepUntil({ conversationId: env.conversationId });
    assert.equal(done, true);
    assert.deepEqual(env.calls.map((c) => c.tool), ['low', 'after']);
    root = await env.prisma.request.findUnique({ where: { id: requestId } });
    assert.equal(root.status, 'COMPLETED');
  } finally {
    await env.cleanup();
  }
});

test('scheduledAt: ISO timestamps are honoured', async () => {
  let now = FIXED_NOW;
  const env = await createEnv('sched_iso', canned, { now: () => now });
  try {
    await runAst(env, { type: 'Curator_Sequential', name: 'iso', subAgents: [tool('after', { scheduledAt: new Date(FIXED_NOW + 5000).toISOString() })] });
    assert.equal(env.calls.length, 0);
    now += 5000;
    await env.processor.stepUntil({ conversationId: env.conversationId });
    assert.equal(env.calls.length, 1);
  } finally {
    await env.cleanup();
  }
});

const wrapTool = (t: any) => ({ execute: (args: any, ctx: any) => t.runAsync({ args, toolContext: ctx }) });

test('scheduled Agent row: the supervisor starts one scheduler loop, which then fires on schedule', async () => {
  let now = FIXED_NOW;
  const env = await createEnv('sched_agent', canned, { now: () => now });
  try {
    const script = await env.prisma.script.create({ data: { name: 'cron_job', ast: tool('after') } });
    const agent = await env.prisma.agent.create({ data: { name: 'cron_agent', scriptId: script.id, schedule: 'every 1 minute', userId: env.userId } });
    // Agent-originated requests are authorised by the agent's own roles, not the owner's.
    await env.prisma.agentRole.create({ data: { agentId: agent.id, roleId: 'admin' } });

    await (env.processor as any).pollScheduledAgents();
    await (env.processor as any).pollScheduledAgents(); // same minute: nothing new
    await env.processor.stepUntil({ conversationId: env.conversationId });
    assert.equal(env.calls.length, 0, 'first iteration waits for its slot');
    const loops = (await env.prisma.request.findMany({ where: { agentId: agent.id } })).filter((r: any) => r.ast?.type === 'Curator_Loop');
    assert.equal(loops.length, 1);
    assert.deepEqual(loops[0].ast, { type: 'Curator_Loop', name: 'agent:cron_agent', schedule: 'every 1 minute', agent: tool('after') });

    now += 60_000;
    await (env.processor as any).pollScheduledAgents(); // loop is live: no duplicate loop
    await env.processor.stepUntil({ conversationId: env.conversationId });
    assert.equal(env.calls.length, 1);
    now += 60_000;
    await env.processor.stepUntil({ conversationId: env.conversationId });
    assert.equal(env.calls.length, 2);
    assert.equal((await env.prisma.request.findMany({ where: { agentId: agent.id } })).filter((r: any) => r.ast?.type === 'Curator_Loop').length, 1);
  } finally {
    await env.cleanup();
  }
});

test('scheduled Agent row: disabled agents are skipped and their live loop is cancelled', async () => {
  const now = FIXED_NOW;
  const env = await createEnv('sched_disabled', canned, { now: () => now });
  try {
    const script = await env.prisma.script.create({ data: { name: 'cron_off', ast: tool('after') } });
    const off = await env.prisma.agent.create({ data: { name: 'off', scriptId: script.id, schedule: 'every 1 minute', userId: env.userId, enabled: false } });
    await (env.processor as any).pollScheduledAgents();
    assert.equal(await env.prisma.request.count({ where: { agentId: off.id } }), 0);

    const on = await env.prisma.agent.create({ data: { name: 'on', scriptId: script.id, schedule: 'every 1 minute', userId: env.userId } });
    await env.prisma.agentRole.create({ data: { agentId: on.id, roleId: 'admin' } });
    (env.processor as any).lastScheduleMinuteBucket = null;
    await (env.processor as any).pollScheduledAgents();
    await env.processor.stepUntil({ conversationId: env.conversationId });
    assert.equal((await env.prisma.request.findMany({ where: { agentId: on.id } })).filter((r: any) => r.status === 'NEW').length, 1);

    await env.prisma.agent.update({ where: { id: on.id }, data: { enabled: false } });
    (env.processor as any).lastScheduleMinuteBucket = null;
    await (env.processor as any).pollScheduledAgents();
    const rows = await env.prisma.request.findMany({ where: { agentId: on.id } });
    assert.ok(rows.every((r: any) => r.status === 'CANCELLED'), JSON.stringify(rows.map((r: any) => r.status)));
    assert.equal(env.calls.length, 0);
  } finally {
    await env.cleanup();
  }
});

test('scheduled Agent row: changing the schedule restarts the loop; a dead loop is recreated', async () => {
  const now = FIXED_NOW;
  const env = await createEnv('sched_restart', canned, { now: () => now });
  try {
    const script = await env.prisma.script.create({ data: { name: 'cron_re', ast: tool('after') } });
    const agent = await env.prisma.agent.create({ data: { name: 're', scriptId: script.id, schedule: 'every 1 minute', userId: env.userId } });
    const poll = async () => { (env.processor as any).lastScheduleMinuteBucket = null; await (env.processor as any).pollScheduledAgents(); };
    const live = async () => (await env.prisma.request.findMany({ where: { agentId: agent.id, parentId: null } })).filter((r: any) => r.status === 'NEW' || r.status === 'WAITING');

    await poll();
    await poll();
    assert.equal((await live()).length, 1);

    await env.prisma.agent.update({ where: { id: agent.id }, data: { schedule: 'every 5 minutes' } });
    await poll();
    const [only] = await live();
    assert.equal(only.ast.schedule, 'every 5 minutes');
    assert.equal((await live()).length, 1);

    await env.prisma.request.update({ where: { id: only.id }, data: { status: 'FAILED' } });
    await poll();
    assert.equal((await live()).length, 1);
  } finally {
    await env.cleanup();
  }
});

test('schedule_agent / cancel_scheduled_agent tools: recurring job becomes an Agent loop, cancel stops it', async () => {
  const now = FIXED_NOW;
  const env = await createEnv('sched_tools', { after: () => 'ok' }, { now: () => now });
  try {
    const schedule_agent = wrapTool((await import('../../src/tools/schedule_agent.ts')).schedule_agent);
    const cancel_scheduled_agent = wrapTool((await import('../../src/tools/cancel_scheduled_agent.ts')).cancel_scheduled_agent);
    const ctx: any = { prisma: env.prisma, userId: env.userId, conversationId: env.conversationId };
    await saveScript(env, 'example_workflow', tool('after'));

    assert.match(await schedule_agent.execute({ name: 'n', workflowName: 'nope', schedule: 'every 1 minute' }, ctx), /not found/);
    assert.match(await schedule_agent.execute({ name: 'n', workflowName: 'example_workflow', schedule: 'whenever' }, ctx), /not a valid/);
    assert.match(await schedule_agent.execute({ name: 'n', workflowName: 'example_workflow' }, ctx), /Must provide/);

    const out = await schedule_agent.execute({ name: 'nightly', workflowName: 'example_workflow', schedule: 'every 1 minute', workflowParams: { a: 1 } }, ctx);
    assert.match(out, /recurring/);
    const agent = await env.prisma.agent.findUnique({ where: { name: 'nightly' }, include: { script: true, roles: true } });
    assert.equal(agent.enabled, true);
    assert.deepEqual(agent.script.ast, { type: 'Curator_Call', ref: 'example_workflow', args: { a: 1 } });
    assert.deepEqual(agent.roles.map((r: any) => r.roleId), ['admin']);

    await (env.processor as any).pollScheduledAgents();
    const loop = await env.prisma.request.findFirst({ where: { agentId: agent.id, parentId: null } });
    assert.equal(loop.ast.type, 'Curator_Loop');
    assert.equal(loop.ast.schedule, 'every 1 minute');

    const cancelled = await cancel_scheduled_agent.execute({ name: 'nightly' }, ctx);
    assert.match(cancelled, /Successfully cancelled/);
    assert.equal((await env.prisma.agent.findUnique({ where: { id: agent.id } })).enabled, false);
    assert.ok((await env.prisma.request.findMany({ where: { agentId: agent.id } })).every((r: any) => r.status === 'CANCELLED'));
    assert.match(await cancel_scheduled_agent.execute({ name: 'ghost' }, ctx), /Could not find/);
  } finally {
    await env.cleanup();
  }
});

test('schedule_agent tool: a one-shot runAt becomes a single delayed request', async () => {
  let now = FIXED_NOW;
  const env = await createEnv('sched_once', { after: () => 'ok' }, { now: () => now });
  try {
    const schedule_agent = wrapTool((await import('../../src/tools/schedule_agent.ts')).schedule_agent);
    await saveScript(env, 'example_workflow', tool('after'));
    const runAt = new Date(FIXED_NOW + 90_000).toISOString();
    const out = await schedule_agent.execute({ name: 'once', workflowName: 'example_workflow', runAt }, { prisma: env.prisma, userId: env.userId, conversationId: env.conversationId } as any);
    assert.match(out, /once at/);
    assert.equal(await env.prisma.agent.count(), 0);

    await env.processor.stepUntil({ conversationId: env.conversationId });
    assert.equal(env.calls.length, 0, 'not due');
    now += 90_000;
    const { done } = await env.processor.stepUntil({ conversationId: env.conversationId });
    assert.equal(done, true);
    assert.equal(env.calls.length, 1);
  } finally {
    await env.cleanup();
  }
});

// ---- Converted legacy script: an LLM schedules, then cancels, a task via tools ----

test('ast/scheduling: agent schedules then cancels a task through tools, with history carried over', async () => {
  const env = await createEnv('sched_llm', {
    schedule_agent: (a: any) => `Successfully scheduled '${a.name}'. ID: 7`,
    cancel_scheduled_agent: () => 'Successfully cancelled scheduled agent ID: 7',
  });
  try {
    const llm = env.useLlm([
      { toolCalls: [{ name: 'schedule_agent', args: { name: 'my_test_task', workflowName: 'example_workflow', schedule: 'every 10 seconds' } }] },
      'Successfully scheduled my_test_task. ID: 7',
      { toolCalls: [{ name: 'cancel_scheduled_agent', args: { id: 7 } }] },
      'Successfully cancelled scheduled agent ID: 7',
    ]);
    const { run } = await import('../fixtures/ast/scheduling.ts');
    const { result } = await runAst(env, run());
    assert.equal(result.done, true);
    assert.deepEqual(env.calls.map((c) => [c.tool, c.args]), [
      ['schedule_agent', { name: 'my_test_task', workflowName: 'example_workflow', schedule: 'every 10 seconds' }],
      ['cancel_scheduled_agent', { id: 7 }],
    ]);
    // The second agent's first request already contains the first agent's exchange.
    assert.ok(llm.requests[2].messages.some((m) => /ID: 7/.test(m.content)));
    assertGolden('ast/scheduling.db.json', await snapshotDb(env));
  } finally {
    await env.cleanup();
  }
});
