import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runScript, saveScript } from '../helpers/harness.ts';
import { validateCuratorAst } from '../../src/engine/CuratorAstValidation.ts';
import { actorRef } from '../../src/engine/builder/CuratorCoreBuilder.ts';

const tool = (name: string, args: any = {}) => ({ type: 'Curator_Tool', toolName: name, args });
const tagged = (tag: string) => ({
  params: { actor: { type: 'object', required: true } },
  returns: '$state.move',
  body: { type: 'Curator_Assign', key: 'move', expression: `'${tag}:' + $params.actor.name` },
});

// One turn node for every seat; the actor decides which registered handler plays it.
const tableModule = (turn: any) => ({
  type: 'Curator_Module',
  name: 'table',
  main: {
    type: 'Curator_Sequential',
    name: 'main',
    subAgents: [
      { type: 'Curator_SetState', state: { players: [{ name: 'Ann', isHuman: true }, { name: 'Bot' }, { name: 'Rock', kind: 'rock' }] } },
      {
        type: 'Curator_ForEach',
        collectionExpression: '$state.players',
        iteratorName: 'p',
        body: { type: 'Curator_Sequential', name: 'seat', subAgents: [turn, tool('record', { move: '$state.lastMove' })] },
      },
    ],
  },
  subroutines: { human_turn: tagged('human'), llm_turn: tagged('llm'), idle_turn: tagged('idle') },
});

test('actorRef: the actor kind picks the registered handler, which receives the actor and returns under `as`', async () => {
  const env = await createEnv('actor_ref_dispatch', { record: (a: any) => ({ got: a.move }) });
  try {
    const turn = actorRef('$context.p', { human: '#human_turn', llm: '#llm_turn', default: '#idle_turn' }, {
      kind: (c: any) => (c.$actor.isHuman ? 'human' : c.$actor.kind ?? 'llm'),
      as: 'lastMove',
    });
    const mod = tableModule(turn);
    assert.equal((validateCuratorAst(mod) as any).valid, true);

    const saved = await saveScript(env, 'table', mod);
    const { requestId, result } = await runScript(env, saved.scriptId, saved.version);
    assert.equal(result.done, true);
    assert.equal((await env.prisma.request.findUnique({ where: { id: requestId } })).status, 'COMPLETED');
    // 'rock' has no handler, so the default one plays it.
    assert.deepEqual(env.calls.map((c) => c.args.move), ['human:Ann', 'llm:Bot', 'idle:Rock']);
  } finally {
    await env.cleanup();
  }
});

test('actorRef: a handler may suspend for human input and resume with the answer', async () => {
  const env = await createEnv('actor_ref_human', { record: (a: any) => ({ got: a.move }) });
  try {
    const mod: any = {
      type: 'Curator_Module',
      name: 'seat',
      main: {
        type: 'Curator_Sequential',
        name: 'main',
        subAgents: [
          { type: 'Curator_ActorRef', actor: "({ name: 'Ann', kind: 'human' })", handlers: { human: '#ask' }, as: 'lastMove' },
          tool('record', { move: '$state.lastMove' }),
        ],
      },
      subroutines: { ask: { body: { type: 'Curator_HumanInput', prompt: 'Your move', inputType: 'text', as: 'answer' } } },
    };
    const saved = await saveScript(env, 'seat', mod);
    const { result } = await runScript(env, saved.scriptId, saved.version);
    assert.equal(result.waiting, true);
    assert.equal(env.calls.length, 0);

    await env.processor.emitEventRequest({
      eventName: 'curator:choice',
      payload: 'RAISE',
      conversationId: env.conversationId,
      userId: env.userId,
      origin: 'API',
    });
    assert.equal((await env.processor.stepUntil({ conversationId: env.conversationId })).done, true);
    assert.deepEqual(env.calls.map((c) => c.args.move), ['RAISE']);
  } finally {
    await env.cleanup();
  }
});

test('actorRef: fails cleanly when no handler matches and there is no default', async () => {
  const env = await createEnv('actor_ref_missing');
  try {
    const mod: any = {
      type: 'Curator_Module',
      name: 'nobody',
      main: { type: 'Curator_ActorRef', actor: "({ kind: 'ghost' })", handlers: { human: '#h' } },
      subroutines: { h: tagged('human') },
    };
    const saved = await saveScript(env, 'nobody', mod);
    const { requestId } = await runScript(env, saved.scriptId, saved.version);
    const root = await env.prisma.request.findUnique({ where: { id: requestId }, include: { responses: true } });
    assert.equal(root.status, 'FAILED');
    assert.match(String(root.responses.at(-1)?.content), /no handler for kind 'ghost'/);
  } finally {
    await env.cleanup();
  }
});

test('actorRef: validation rejects local handlers that are not subroutines of the module', () => {
  const mod: any = tableModule({ type: 'Curator_ActorRef', actor: '$context.p', handlers: { human: '#missing' } });
  const { valid, errors } = validateCuratorAst(mod) as any;
  assert.equal(valid, false);
  assert.ok(errors.some((e: string) => e.includes("handlers/human references missing subroutine '#missing'")), errors.join('\n'));
});
