import test from 'node:test';
import assert from 'node:assert/strict';
import { demoPlugin } from '../dist/plugins/demo.js';

test('Blueprint demoPlugin exports valid tools and agents', () => {
  assert.equal(demoPlugin.name, 'blueprint-demo');
  assert.ok(demoPlugin.tools?.calculate_metric);
  assert.ok(demoPlugin.agents?.metric_calculator);
  assert.ok(demoPlugin.agents?.dialog_playground);
  assert.ok(demoPlugin.agents?.coffee_evaluator);

  const decl = demoPlugin.tools?.calculate_metric.toMcpDeclaration();
  assert.equal(decl?.name, 'calculate_metric');
});

test('calculateMetricTool executes correctly', async () => {
  const tool = demoPlugin.tools?.calculate_metric;
  const result: any = await tool?.runAsync({
    args: { baseValue: 20, multiplier: 4 },
    toolContext: {},
  });

  assert.equal(result.calculated, 80);
  assert.equal(result.status, 'success');
});

test('dialog_playground AST contains sequential and while loop structures', () => {
  const agent = demoPlugin.agents?.dialog_playground;
  assert.ok(agent);
  assert.equal(agent.ast.type, 'Curator_Sequential');
  assert.ok(Array.isArray(agent.ast.subAgents));
  assert.ok(agent.ast.subAgents.some((sub: any) => sub.type === 'Curator_While'));
});

test('coffee_evaluator AST specifies coffeescript language', () => {
  const agent = demoPlugin.agents?.coffee_evaluator;
  assert.ok(agent);
  assert.equal(agent.ast.type, 'Curator_Sequential');
  const scriptNode = agent.ast.subAgents?.find((sub: any) => sub.type === 'Curator_Script');
  assert.ok(scriptNode);
  assert.equal(scriptNode.language, 'coffeescript');
});

test('compileCoffeeScriptToAST compiles natural verbs to execution AST', async () => {
  const { compileCoffeeScriptToAST } = await import('../../../curator/dist/src/index.js');
  const coffeeCode = `
    seq "my_natural_pipeline",
      set_state active: true, step: 1
      tool "calculate_metric", baseValue: 30, multiplier: 2
      assign "state.step", (ctx) -> ctx.state.step + 1
  `;

  const ast: any = await compileCoffeeScriptToAST(coffeeCode);
  assert.equal(ast.type, 'Curator_Sequential');
  assert.equal(ast.name, 'my_natural_pipeline');
  assert.equal(ast.subAgents.length, 3);
  assert.equal(ast.subAgents[0].type, 'Curator_SetState');
  assert.equal(ast.subAgents[1].type, 'Curator_Tool');
  assert.equal(ast.subAgents[1].toolName, 'calculate_metric');
  assert.equal(ast.subAgents[2].type, 'Curator_Assign');
});

test('P2P Mesh connects two hosts and exchanges Bang/Ping/Pong events', async () => {
  const { createCuratorHost } = await import('../../../packages/host/dist/index.js');
  const { withFederation } = await import('../../../packages/federation/dist/index.js');
  const { curatorEngine } = await import('../../../curator/dist/src/index.js');

  const hostA = await createCuratorHost({
    name: 'test-host-a',
    dataDir: './data/test_mesh_a',
    registerPlugins: async () => curatorEngine,
  });

  const meshA = await withFederation(hostA, {
    peerId: 'peer-a',
    meshPort: 5201,
    peers: [{ id: 'peer-b', eventsUrl: 'ws://127.0.0.1:5202/api/mesh/events' }],
  });

  const hostB = await createCuratorHost({
    name: 'test-host-b',
    dataDir: './data/test_mesh_b',
    registerPlugins: async () => curatorEngine,
  });

  const meshB = await withFederation(hostB, {
    peerId: 'peer-b',
    meshPort: 5202,
    peers: [{ id: 'peer-a', eventsUrl: 'ws://127.0.0.1:5201/api/mesh/events' }],
  });

  await new Promise((r) => setTimeout(r, 600));

  let pongReceived = false;
  hostA.events.onEvent((event: any) => {
    if (event.type === 'game:pong' || event.type === 'mesh:game:pong') {
      pongReceived = true;
    }
  });

  hostB.events.onEvent((event: any) => {
    if (event.type === 'game:ping' || event.type === 'mesh:game:ping') {
      meshB.broadcastEvent('game:pong', { echoed: true });
    }
  });

  meshA.broadcastEvent('game:ping', { msg: 'PING' });

  for (let i = 0; i < 20; i++) {
    if (pongReceived) break;
    await new Promise((r) => setTimeout(r, 100));
  }

  assert.equal(pongReceived, true);

  await meshA.close();
  await meshB.close();
  await hostA.stop();
  await hostB.stop();
});

test('GraphQL API resolves metrics, tools, and executes queries', async () => {
  const { createBlueprintHost } = await import('../dist/host.js');
  const { executeGraphqlQuery } = await import('../dist/server/graphql.js');

  const host = await createBlueprintHost();

  const query = `
    query GetBlueprintOverview {
      metrics {
        totalRequests
        totalTools
        databaseEngine
      }
      tools {
        name
        description
      }
      agents {
        name
        enabled
      }
    }
  `;

  const res: any = await executeGraphqlQuery(host, query);
  assert.ok(!res.errors, `GraphQL query had errors: ${JSON.stringify(res.errors)}`);
  assert.ok(res.data?.metrics);
  assert.equal(res.data.metrics.databaseEngine, 'SQLite');
  assert.ok(Array.isArray(res.data.tools));
  assert.ok(res.data.tools.some((t: any) => t.name === 'calculate_metric'));
  assert.ok(Array.isArray(res.data.agents));
  assert.ok(res.data.agents.some((a: any) => a.name === 'dialog_playground'));
});

