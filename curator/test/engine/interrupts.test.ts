import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst, stepResults } from '../helpers/harness.ts';
import { conversation_resume, conversation_interrupts } from '../../src/tools/interrupts.ts';
import { InterruptService } from '../../src/engine/Interrupts.ts';
import { validateCuratorAst } from '../../src/engine/CuratorAstValidation.ts';

const tool = (name: string, args: any = {}, extra: any = {}) => ({ type: 'Curator_Tool', toolName: name, args, ...extra });
const ask = (extra: any = {}) => ({ type: 'Curator_HumanInput', prompt: 'Pick one', inputType: 'choices', choices: ['red', 'blue'], as: 'pick', ...extra });

function requireApproval(env: any, name: string) {
  const t = env.processor.engine.tools.get(name);
  t.requiresHumanApproval = true;
  t.requiresConfirmation = true;
}

const state = async (env: any) => {
  const conv = await env.prisma.conversation.findUnique({ where: { id: env.conversationId } });
  return conv.metadata || {};
};

test('interrupts: a human prompt parks with an interrupt and resumes with a typed value', async () => {
  const env = await createEnv('int_prompt', { after: () => 'ok' });
  try {
    const { requestId, result } = await runAst(env, ask({ resume: { schema: { enum: ['red', 'blue'] } } }));
    assert.equal(result.waiting, true);

    const [open] = await env.processor.listInterrupts({ projectIds: [] });
    assert.equal(open.id, `${requestId}.1`);
    assert.equal(open.kind, 'human_input');
    assert.equal(open.prompt, 'Pick one');
    assert.deepEqual(open.payload.choices.map((c: any) => c.value), ['red', 'blue']);
    assert.deepEqual(open.resumeSchema, { enum: ['red', 'blue'] });

    await assert.rejects(
      env.processor.resumeInterrupt({ interruptId: open.id, value: 'green', userId: env.userId, projectIds: [] }),
      /Invalid resume value/
    );
    assert.equal((await env.processor.listInterrupts({ projectIds: [] })).length, 1, 'an invalid value leaves it open');

    const res = await env.processor.resumeInterrupt({ interruptId: open.id, value: 'blue', userId: env.userId, projectIds: [] });
    assert.deepEqual(res, { interruptId: open.id, requestId, kind: 'human_input', outcome: 'resumed' });
    const done = await env.processor.stepUntil({ conversationId: env.conversationId });
    assert.equal(done.done, true);
    assert.equal((await env.prisma.request.findUnique({ where: { id: requestId } })).status, 'COMPLETED');
    assert.equal((await state(env)).pick, 'blue');
    assert.deepEqual(await env.processor.listInterrupts({ projectIds: [] }), []);

    await assert.rejects(
      env.processor.resumeInterrupt({ interruptId: open.id, value: 'red', userId: env.userId, projectIds: [] }),
      /no longer open/,
      'a resumed interrupt cannot be resumed twice'
    );
    // Only what nothing else holds is stored: prompt and choices are described from the prompt's own keys
    const parked = await env.prisma.request.findUnique({ where: { id: requestId } });
    assert.deepEqual(Object.keys(parked.context.__interrupt ?? {}).sort(), [], 'the envelope is cleared once resumed');
  } finally {
    await env.cleanup();
  }
});

test('interrupts: a prompt without `as` gets the value as its result', async () => {
  const env = await createEnv('int_prompt_noas', {});
  try {
    const { requestId } = await runAst(env, { type: 'Curator_HumanInput', prompt: 'Name?', inputType: 'text' });
    const [open] = await env.processor.listInterrupts({ projectIds: [] });
    await env.processor.resumeInterrupt({ interruptId: open.id, value: 'Ada', userId: env.userId, projectIds: [] });
    await env.processor.stepUntil({ conversationId: env.conversationId });
    const results = (await stepResults(env.prisma, { requestId })).map((r) => r.content);
    assert.deepEqual(results, ['Ada']);
  } finally {
    await env.cleanup();
  }
});

test('interrupts: ids, users and projects are checked', async () => {
  const env = await createEnv('int_checks', {});
  try {
    await env.prisma.project.create({ data: { id: 'p1', name: 'P1', userId: env.userId } });
    const { requestId } = await runAst(env, ask({ targetUserId: 'player-2' }), { projectId: 'p1' });
    const resume = (over: any) => env.processor.resumeInterrupt({ interruptId: `${requestId}.1`, value: 'red', userId: 'player-2', projectIds: ['p1'], ...over });

    assert.equal((await env.processor.listInterrupts({ projectIds: ['p1'] })).length, 1);
    assert.equal((await env.processor.listInterrupts({ projectIds: ['p2'] })).length, 0, 'other projects do not see it');
    assert.equal((await env.processor.listInterrupts({ projectIds: [] })).length, 0, 'unscoped callers do not see project requests');

    await assert.rejects(resume({ interruptId: 'nope' }), /Malformed interrupt id/);
    await assert.rejects(resume({ interruptId: `${requestId}.7` }), /no longer open/);
    await assert.rejects(resume({ projectIds: ['p2'] }), /not found/);
    await assert.rejects(resume({ userId: 'player-1' }), /addressed to another user/);
    assert.equal((await resume({})).outcome, 'resumed');
  } finally {
    await env.cleanup();
  }
});

test('interrupts: an event wait resumes with the event payload, without publishing the event', async () => {
  const env = await createEnv('int_event', {});
  try {
    const { requestId } = await runAst(env, { type: 'Curator_WaitEvent', eventName: 'ping', payloadAlias: 'msg' });
    const [open] = await env.processor.listInterrupts({ projectIds: [] });
    assert.equal(open.kind, 'event');
    assert.deepEqual(open.payload.eventNames, ['ping']);

    await env.processor.resumeInterrupt({ interruptId: open.id, value: { text: 'hi' }, userId: env.userId, projectIds: [] });
    const done = await env.processor.stepUntil({ conversationId: env.conversationId });
    assert.equal(done.done, true);
    assert.equal((await env.prisma.request.findUnique({ where: { id: requestId } })).status, 'COMPLETED');
    assert.deepEqual((await state(env)).msg, { text: 'hi' });
    const pings = await env.prisma.busEvent.count({ where: { conversationId: env.conversationId, eventName: 'ping' } });
    assert.equal(pings, 0);
  } finally {
    await env.cleanup();
  }
});

test('interrupts: approving a gated tool grants the approval and runs it', async () => {
  const env = await createEnv('int_approve', { danger: () => 'done' });
  try {
    requireApproval(env, 'danger');
    const { requestId } = await runAst(env, tool('danger', { x: 1 }));
    const [open] = await env.processor.listInterrupts({ projectIds: [], kind: 'approval' });
    assert.equal(open.payload.tool, 'danger');
    assert.deepEqual(open.payload.args, { x: 1 });

    await assert.rejects(
      env.processor.resumeInterrupt({ interruptId: open.id, value: { approved: 'yes' }, userId: env.userId, projectIds: [] }),
      /Invalid resume value/
    );
    await env.processor.resumeInterrupt({ interruptId: open.id, value: { approved: true }, userId: env.userId, projectIds: [] });
    const done = await env.processor.stepUntil({ conversationId: env.conversationId });
    assert.equal(done.done, true);
    assert.equal(env.calls.length, 1);
    assert.equal((await env.prisma.request.findUnique({ where: { id: requestId } })).status, 'COMPLETED');
    // The curator schema has no ToolApproval table: a one-time approval rides on the request alone
    if (!env.prisma.toolApproval) {
      await runAst(env, tool('danger', {}));
      const [next] = await env.processor.listInterrupts({ projectIds: [] });
      await assert.rejects(
        env.processor.resumeInterrupt({ interruptId: next.id, value: { approved: true, scope: 'PERMANENT' }, userId: env.userId, projectIds: [] }),
        /needs the ToolApproval table/
      );
      assert.equal((await env.processor.listInterrupts({ projectIds: [] })).length, 1, 'a failed resume leaves the interrupt open');
    }
  } finally {
    await env.cleanup();
  }
});

for (const mode of ['fail', 'continue'] as const) {
  test(`interrupts: denying an approval ends the step like an expiry (onApprovalExpired='${mode}')`, async () => {
    const env = await createEnv('int_deny_' + mode, { danger: () => 'done' });
    try {
      requireApproval(env, 'danger');
      const { requestId } = await runAst(env, tool('danger', {}, { as: 'outcome', onApprovalExpired: mode }));
      const [open] = await env.processor.listInterrupts({ projectIds: [] });
      const res = await env.processor.resumeInterrupt({ interruptId: open.id, value: { approved: false, reason: 'too risky' }, userId: env.userId, projectIds: [] });
      assert.equal(res.outcome, 'denied');
      await env.processor.stepUntil({ conversationId: env.conversationId });
      assert.equal(env.calls.length, 0, 'the tool never ran');
      const req = await env.prisma.request.findUnique({ where: { id: requestId } });
      assert.equal(req.status, mode === 'fail' ? 'FAILED' : 'COMPLETED');
      const contents = (await stepResults(env.prisma, { requestId })).map((r) => r.content);
      assert.ok(contents.some((c) => /APPROVAL_DENIED/.test(c) && /too risky/.test(c)));
      if (mode === 'continue') assert.equal(req.context.outcome.denied, true);
    } finally {
      await env.cleanup();
    }
  });
}

test('interrupts: conversation_resume refuses agents and uses the session project', async () => {
  const calls: any[] = [];
  const api = {
    list: async (filter: any) => { calls.push(['list', filter]); return []; },
    resume: async (input: any) => { calls.push(['resume', input]); return { interruptId: input.interruptId, requestId: 1, kind: 'human_input', outcome: 'resumed' }; },
  };
  const ctx = (extra: any) => ({ userId: 'u1', projectId: 'p1', tryService: (key: any) => (key === InterruptService ? api : undefined), ...extra });

  await assert.rejects(conversation_resume.runAsync({ args: { interruptId: '1.1', value: 'x' }, toolContext: ctx({ agentId: 'bot' }) }), /human callers/);
  await conversation_resume.runAsync({ args: { interruptId: '1.1', value: 'x' }, toolContext: ctx({}) });
  await conversation_interrupts.runAsync({ args: { kind: 'approval' }, toolContext: ctx({}) });
  assert.deepEqual(calls, [
    ['resume', { interruptId: '1.1', value: 'x', userId: 'u1', projectIds: ['p1'] }],
    ['list', { projectIds: ['p1'], conversationId: undefined, kind: 'approval' }],
  ]);
});

test('interrupts: resume schemas are validated on wait nodes', () => {
  assert.equal(validateCuratorAst(ask({ resume: { schema: { type: 'string' } } })).valid, true);
  assert.equal(validateCuratorAst({ type: 'Curator_WaitEvent', eventName: 'e', resume: { schema: { type: 'object' } } }).valid, true);
  assert.equal(validateCuratorAst(ask({ resume: { type: 'string' } })).valid, false);
});
