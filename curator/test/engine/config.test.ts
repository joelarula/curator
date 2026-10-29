import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst } from '../helpers/harness.ts';
import { validateCuratorAst } from '../../src/engine/CuratorAstValidation.ts';
import { CuratorEngine, mergeConfig } from '../../src/engine/CuratorEngine.ts';
import { defineConfig } from '../../src/engine/builder/CuratorConfig.ts';

test('$config: conditions, reducer args and prompt templates read the configuration', async () => {
  const env = await createEnv('config_reads', { echo: (args: any) => ({ echoed: args }) });
  try {
    env.setConfig({ game: { limit: 3, greeting: 'Howdy', models: { talk: 'model-from-config' } } });
    const llm = env.useLlm(() => 'ok');
    const game = defineConfig<{ limit: number; greeting: string; models: { talk: string } }>('game');

    await runAst(env, {
      type: 'Curator_Sequential',
      name: 'main',
      subAgents: [
        { type: 'Curator_Reduce', reducer: 'echo', args: { limit: String(game.limit) }, as: 'out', spread: false },
        {
          type: 'Curator_IfElse',
          condition: `${game.limit} > 2`,
          thenBranch: { type: 'Curator_SetState', state: { big: true } },
          elseBranch: { type: 'Curator_SetState', state: { big: false } },
        },
        { type: 'Curator_Agent', agentName: 'talker', model: String(game.models.talk), prompt: `{${game.greeting}} there` },
      ],
    });

    assert.deepEqual(env.calls.find((c: any) => c.reducer === 'echo')?.args, { limit: 3 });
    const { stateAt } = await import('../../src/engine/ConversationStateLog.ts');
    assert.equal((await stateAt(env.prisma, env.conversationId)).big, true);
    assert.equal(llm.requests[0]?.model, 'model-from-config', 'the agent model is resolved from $config');
    assert.match(JSON.stringify(llm.requests[0]?.messages), /Howdy there/);
  } finally {
    await env.cleanup();
  }
});

test('$config: workflows cannot change it', async () => {
  const env = await createEnv('config_readonly', { echo: (args: any) => args });
  try {
    env.setConfig({ game: { limit: 3 } });
    await runAst(env, { type: 'Curator_Reduce', reducer: 'echo', args: { tried: '$config.game.limit = 99' } });
    await runAst(env, { type: 'Curator_Reduce', reducer: 'echo', args: { limit: '$config.game.limit' } });
    assert.equal(env.calls.at(-1)?.args.limit, 3);
  } finally {
    await env.cleanup();
  }
});

test('$config: model and provider accept expressions; plain providers still validate', () => {
  const valid = (provider: string) => validateCuratorAst({ type: 'Curator_Agent', agentName: 'a', provider, model: '$config.game.model' } as any).valid;
  assert.equal(valid('gemini'), true);
  assert.equal(valid("$config.game?.provider || 'gemini'"), true);
  assert.equal(valid('openai'), false);
});

test('engine config: plugin defaults sit under host settings, whatever the order', () => {
  const engine = new CuratorEngine();
  engine.setConfig({ game: { limit: 5, models: { talk: 'host-model' } } });
  engine.registerPlugin({ name: 'game-plugin', config: { game: { limit: 1, greeting: 'Hi', models: { seat: 'plugin-seat' } } } });
  assert.deepEqual(engine.config, { game: { limit: 5, greeting: 'Hi', models: { seat: 'plugin-seat', talk: 'host-model' } } });
  assert.ok(Object.isFrozen(engine.config.game.models), 'deeply frozen');

  const mine = { game: { limit: 7 } };
  engine.setConfig(mine);
  assert.equal(engine.config.game.limit, 7);
  assert.ok(!Object.isFrozen(mine), "the caller's object is left alone");
  assert.deepEqual(mergeConfig({ a: { b: 1, c: [1] } }, { a: { c: [2] } }), { a: { b: 1, c: [2] } }, 'arrays are replaced');
});
