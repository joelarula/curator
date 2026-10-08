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
