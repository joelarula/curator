import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst } from '../helpers/harness.ts';
import { defineConfig } from '../../src/engine/builder/CuratorConfig.ts';
import { PluginConfig, type PluginConfigService } from '../../src/services/PluginConfigService.ts';
import { pluginConfigTools } from '../../src/tools/pluginConfig.ts';

const SCHEMAS = {
  demo: {
    type: 'object',
    title: 'Demo',
    properties: {
      greeting: { type: 'string', 'x-curator-scope': ['system', 'project', 'user'] },
      limit: { type: 'integer', minimum: 1, 'x-curator-scope': 'project' },
      apiKey: { type: 'string', format: 'secret' },
    },
  },
};

async function setup(name: string, canned: Record<string, any> = {}) {
  const env = await createEnv(name, canned);
  const engine = (env.processor as any).engine;
  engine.configSchemas = new Map(Object.entries(SCHEMAS));
  env.setConfig({ demo: { greeting: 'Hi', limit: 2 } });
  for (const [k, tool] of Object.entries(pluginConfigTools)) engine.tools.set(k, tool);
  await env.prisma.project.create({ data: { id: 'p1', name: 'P1', userId: env.userId } });
  await env.prisma.project.create({ data: { id: 'p2', name: 'P2', userId: env.userId } });
  const svc = (env.processor as any).tryService(PluginConfig) as PluginConfigService;
  return { env, svc };
}

test('plugin config: system < project < user, validation, unset and describe', async () => {
  const { env, svc } = await setup('pc_scopes');
  try {
    const me = { projectId: 'p1', userId: env.userId };
    assert.equal((await svc.resolve(me)).demo.greeting, 'Hi', 'default');
    await svc.set({ namespace: 'demo', key: 'greeting', scope: 'system', value: 'Hello', ...me });
    await svc.set({ namespace: 'demo', key: 'greeting', scope: 'project', value: 'Hej', ...me });
    await svc.set({ namespace: 'demo', key: 'greeting', scope: 'user', value: 'Tere', ...me });
    await svc.set({ namespace: 'demo', key: 'greeting', scope: 'user', value: 'Tere!', ...me });
    assert.equal((await svc.resolve(me)).demo.greeting, 'Tere!', 'user wins; saving again replaces');
    assert.equal((await svc.resolve({ projectId: 'p1', userId: 'someone-else' })).demo.greeting, 'Hej');
    assert.equal((await svc.resolve({ projectId: 'p2', userId: env.userId })).demo.greeting, 'Hello');
    assert.equal((await svc.resolve(me)).demo.limit, 2, 'other keys keep their defaults');
    assert.ok(Object.isFrozen((await svc.resolve(me)).demo), 'resolved config is read-only');

    const errors = (w: any) => svc.validate({ namespace: 'demo', ...me, ...w });
    assert.match(errors({ key: 'limit', scope: 'user', value: 3 })[0], /project scope, not user/);
    assert.match(errors({ key: 'limit', scope: 'project', value: 0 })[0], />= 1/);
    assert.match(errors({ key: 'apiKey', scope: 'system', value: 'plain-key' })[0], /format/);
    assert.deepEqual(errors({ key: 'apiKey', scope: 'system', value: 'secret://DEMO_KEY' }), []);
    assert.match(errors({ key: 'nope', scope: 'system', value: 1 })[0], /Unknown config key/);
    await assert.rejects(svc.set({ namespace: 'demo', key: 'limit', scope: 'project', value: 'x', ...me }), /Invalid config value/);

    assert.equal(await svc.unset({ namespace: 'demo', key: 'greeting', scope: 'user', ...me }), true);
    assert.equal((await svc.resolve(me)).demo.greeting, 'Hej');
    await svc.set({ namespace: 'demo', key: 'greeting', scope: 'user', value: 'Again', ...me });
    assert.equal((await svc.resolve(me)).demo.greeting, 'Again', 'a value can be saved again after unset');

    const [view] = await svc.describe(me);
    const greeting = view.keys.find((k) => k.key === 'greeting')!;
    assert.equal(view.title, 'Demo');
    assert.deepEqual([greeting.value, greeting.source, greeting.default], ['Again', 'user', 'Hi']);
    assert.deepEqual(greeting.saved, { system: 'Hello', project: 'Hej', user: 'Again' });
    assert.deepEqual(view.keys.find((k) => k.key === 'apiKey')!.scopes, ['system']);
  } finally {
    await env.cleanup();
  }
});

test('plugin config: workflows read saved values of their project through $config', async () => {
  const { env, svc } = await setup('pc_workflow', { echo: (args: any) => args });
  try {
    await svc.set({ namespace: 'demo', key: 'greeting', scope: 'project', value: 'Hej', projectId: 'p1', userId: env.userId });
    const demo = defineConfig<{ greeting: string }>('demo');
    await runAst(env, { type: 'Curator_Reduce', reducer: 'echo', args: { g: String(demo.greeting) } }, { projectId: 'p1' });
    await runAst(env, { type: 'Curator_Reduce', reducer: 'echo', args: { g: String(demo.greeting) } }, { projectId: 'p2' });
    assert.deepEqual(env.calls.filter((c: any) => c.reducer === 'echo').map((c: any) => c.args.g), ['Hej', 'Hi']);
  } finally {
    await env.cleanup();
  }
});

test('plugin config tools: people save their own values; project/system scope need a role; agents cannot save', async () => {
  const { env } = await setup('pc_tools');
  try {
    const run = (args: any, extra: any = {}) =>
      env.processor.runToolRequest({ toolName: 'config_set', args, conversationId: env.conversationId, userId: env.userId, projectId: 'p1', origin: 'API', ...extra } as any);

    await run({ namespace: 'demo', key: 'greeting', scope: 'user', value: 'Mine' });
    const got = await env.processor.runToolRequest({ toolName: 'config_get', args: { namespace: 'demo' }, conversationId: env.conversationId, userId: env.userId, projectId: 'p1', origin: 'API' } as any);
    assert.equal(got.result.namespaces[0].keys.find((k: any) => k.key === 'greeting').value, 'Mine');

    const plain = await env.prisma.user.create({ data: { name: 'Plain', email: 'plain@example.com' } });
    await assert.rejects(run({ namespace: 'demo', key: 'greeting', scope: 'project', value: 'X' }, { userId: plain.id }), /config:project|Access Denied|role/i);

    const agent = await env.prisma.agent.create({ data: { name: 'cfg-agent', userId: env.userId } });
    await assert.rejects(run({ namespace: 'demo', key: 'greeting', scope: 'user', value: 'Bot' }, { agentId: agent.id }), /human callers|Access Denied/);
  } finally {
    await env.cleanup();
  }
});
