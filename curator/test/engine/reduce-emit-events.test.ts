import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst } from '../helpers/harness.ts';
import { stateAt } from '../../src/engine/ConversationStateLog.ts';
import { reduce, emitEvents, seq } from '../../src/engine/builder/CuratorCoreBuilder.ts';
import { validateCuratorAst } from '../../src/engine/CuratorAstValidation.ts';

const counter = {
  count: (a: any) => ({ counter: (Number(a.counter) || 0) + Number(a.by), events: [{ name: 'counted', payload: { by: a.by } }] }),
};

const eventsNamed = async (env: any, name: string) =>
  (await env.prisma.eventLog.findMany({ where: { eventName: name }, orderBy: { id: 'asc' } }))
    .map((e: any) => (typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload));

test('reduce: runs the registered pure function and spreads its output into state', async () => {
  const env = await createEnv('reduce_spread', counter);
  try {
    const { result } = await runAst(env, {
      type: 'Curator_Sequential',
      subAgents: [
        reduce('count', { counter: '$state.counter', by: 2 }),
        reduce('count', { counter: '$state.counter', by: 3 }),
        reduce('count', { counter: '$context.counter', by: 0 }),
      ],
    });

    assert.equal(result.done, true);
    // Like any step's output, the last root step's output is not merged into state; the third step is the probe
    assert.equal((await stateAt(env.prisma, env.conversationId)).counter, 5, 'each step read the previous output from state');
    assert.deepEqual(env.calls.map((c) => c.args.counter), [undefined, 2, 5], 'the output is in context as well');
    assert.deepEqual(env.calls.map((c) => c.reducer), ['count', 'count', 'count']);
    assert.ok(env.calls.every((c) => c.tool === undefined), 'no tool ran');
  } finally {
    await env.cleanup();
  }
});

test('reduce: spread=false keeps the output under `as` only', async () => {
  const env = await createEnv('reduce_as', counter);
  try {
    await runAst(env, seq('as', [
      reduce('count', { by: 1 }, 'step', { spread: false }),
      reduce('count', { counter: '$state.step.counter', by: 0 }, 'probe', { spread: false }),
    ]));
    const state = await stateAt(env.prisma, env.conversationId);
    assert.equal(state.step?.counter, 1);
    assert.equal(state.counter, undefined, 'fields are not spread');
    assert.equal(env.calls[1].args.counter, 1);
  } finally {
    await env.cleanup();
  }
});

test('reduce: an unknown reducer fails the step', async () => {
  const env = await createEnv('reduce_unknown', counter);
  try {
    const { requestId } = await runAst(env, reduce('missing', {}));
    const req = await env.prisma.request.findUnique({ where: { id: requestId } });
    assert.equal(req.status, 'FAILED');
  } finally {
    await env.cleanup();
  }
});

test('emitEvents: emits a run-time list in order, with payloads taken as data', async () => {
  const env = await createEnv('emit_events', counter);
  try {
    const { result } = await runAst(env, seq('emit', [
      reduce('count', { by: 4 }),
      emitEvents('$state.events'),
      {
        type: 'Curator_SetState',
        state: { list: [{ name: 'first', payload: { text: '$state.counter' } }, { name: 'second' }] },
      },
      emitEvents('$state.list'),
    ]));

    assert.equal(result.done, true);
    const counted = await eventsNamed(env, 'counted');
    assert.equal(counted.length, 1);
    assert.equal(counted[0].by, 4);
    assert.equal(counted[0].conversationId, env.conversationId, 'payloads are stamped with their conversation');

    const names = (await env.prisma.eventLog.findMany({ orderBy: { id: 'asc' } }))
      .map((e: any) => e.eventName).filter((n: string) => ['counted', 'first', 'second'].includes(n));
    assert.deepEqual(names, ['counted', 'first', 'second']);
    assert.equal((await eventsNamed(env, 'first'))[0].text, '$state.counter', 'a payload string is not evaluated');

    const state = await stateAt(env.prisma, env.conversationId);
    assert.equal(state.type, undefined, 'the EVENTS_EMITTED record is not merged into state');
  } finally {
    await env.cleanup();
  }
});

test('emitEvents: a value that is not a list of named events fails the step', async () => {
  const env = await createEnv('emit_events_bad', counter);
  try {
    const { requestId } = await runAst(env, emitEvents('$state.counter || 7'));
    assert.equal((await env.prisma.request.findUnique({ where: { id: requestId } })).status, 'FAILED');
  } finally {
    await env.cleanup();
  }
});

test('reduce / emitEvents: nodes validate against the AST schema', () => {
  assert.equal(validateCuratorAst(reduce('count', { by: 1 }, 'step', { spread: false })).valid, true);
  assert.equal(validateCuratorAst(emitEvents('$state.events')).valid, true);
  assert.equal(validateCuratorAst({ type: 'Curator_Reduce' }).valid, false, 'a reducer name is required');
  assert.equal(validateCuratorAst({ type: 'Curator_EmitEvents', events: '' }).valid, false);
});
