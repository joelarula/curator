import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst } from '../helpers/harness.ts';
import { validateCuratorAst } from '../../src/engine/CuratorAstValidation.ts';
import { CuratorEngine, mergeConfig } from '../../src/engine/CuratorEngine.ts';
import { defineConfig } from '../../src/engine/builder/CuratorConfig.ts';
import { defineModule } from '../../src/engine/builder/CuratorCoreBuilder.ts';
import { loadConfigFile, findConfigFile } from '../../src/engine/CuratorConfigFile.ts';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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

test('config files: YAML and JSON load, YAML wins the lookup, bad files throw with their path', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'curator-config-'));
  try {
    fs.writeFileSync(path.join(dir, 'game.config.json'), JSON.stringify({ game: { limit: 1 } }));
    assert.equal(findConfigFile('game.config', [dir]), path.join(dir, 'game.config.json'));
    assert.deepEqual(loadConfigFile(path.join(dir, 'game.config.json')), { game: { limit: 1 } });

    fs.writeFileSync(path.join(dir, 'game.config.yaml'), '# comments are fine\ngame:\n  limit: 4\n  models: { talk: m1 }\n');
    assert.equal(findConfigFile('game.config', [path.join(dir, 'nowhere'), dir]), path.join(dir, 'game.config.yaml'), '.yaml before .json');
    assert.deepEqual(loadConfigFile(path.join(dir, 'game.config.yaml')), { game: { limit: 4, models: { talk: 'm1' } } });

    fs.writeFileSync(path.join(dir, 'empty.yaml'), '');
    assert.deepEqual(loadConfigFile(path.join(dir, 'empty.yaml')), {});
    fs.writeFileSync(path.join(dir, 'list.yaml'), '- a\n- b\n');
    assert.throws(() => loadConfigFile(path.join(dir, 'list.yaml')), /list\.yaml: the top level must be a mapping/);
    fs.writeFileSync(path.join(dir, 'broken.json'), '{ nope');
    assert.throws(() => loadConfigFile(path.join(dir, 'broken.json')), /Invalid config file .*broken\.json/);
    assert.throws(() => loadConfigFile(path.join(dir, 'missing.yaml')), /missing\.yaml/);
    assert.equal(findConfigFile('other', [dir]), undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('script defaults: YAML front matter and module config sit under plugin and host config', () => {
  const engine = new CuratorEngine();
  const script = [
    '---',
    'id: greeter',
    'description: Says hi',
    'config:',
    '  game:',
    '    limit: 2',
    '    greeting: Hello',
    '    models: { talk: script-model }',
    '---',
    'say "hi"',
  ].join('\n');
  const commented = ['# ---', '# id: commented', '# config:', '#   game: { colour: red }', '# ---', 'x = 1'].join('\n');
  const module = defineModule('counter', { config: { game: { limit: 3, step: 1 } } }, () => ({ type: 'Curator_SetState', state: { n: 1 } }));
  assert.deepEqual(module.config, { game: { limit: 3, step: 1 } });
  assert.equal(validateCuratorAst(module).valid, true, 'a module may carry config');

  engine.setConfig({ game: { greeting: 'Howdy' } });
  engine.registerPlugin({
    name: 'game-plugin',
    scripts: { 'greeter.coffee': script, 'commented.coffee': commented, counter: { name: 'counter', ast: module, run: async () => {} } },
    config: { game: { limit: 10 } },
  });

  assert.equal(engine.scripts.get('greeter')?.description, 'Says hi', 'header fields still read');
  assert.ok(engine.scripts.get('commented'), 'commented front matter is read too');
  assert.deepEqual(engine.config.game, {
    limit: 10, // plugin over script defaults
    greeting: 'Howdy', // host over everything
    models: { talk: 'script-model' },
    step: 1,
    colour: 'red',
  });
});

test('front matter: a block YAML cannot read still yields its flat key: value lines', () => {
  const engine = new CuratorEngine();
  engine.registerPlugin({ name: 'p', scripts: { 'odd.coffee': '---\nid: odd\ndescription: a: b: c\n---\nx = 1' } });
  assert.equal(engine.scripts.get('odd')?.description, 'a: b: c');
  assert.deepEqual(engine.config, {});
});
