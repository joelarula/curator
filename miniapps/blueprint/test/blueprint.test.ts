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
  const ast: any = 'ast' in agent ? agent.ast : agent;
  assert.ok(ast);
  assert.equal(ast.type, 'Curator_Sequential');
  assert.ok(Array.isArray(ast.subAgents));
  assert.ok(ast.subAgents.some((sub: any) => sub.type === 'Curator_While'));
});

test('coffee_evaluator AST specifies coffeescript language', () => {
  const agent = demoPlugin.agents?.coffee_evaluator;
  assert.ok(agent);
  const ast: any = 'ast' in agent ? agent.ast : agent;
  assert.ok(ast);
  assert.equal(ast.type, 'Curator_Sequential');
  const scriptNode = ast.subAgents?.find((sub: any) => sub.type === 'Curator_Script');
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

test('compileCoffeeScriptToAST compiles fluent SpeechActs and intra-node dialog/forum verbs', async () => {
  const { compileCoffeeScriptToAST } = await import('../../../curator/dist/src/index.js');

  // Test 1: Direct speech act verbs
  const coffeeVerbsCode = `
    seq "conversational_pipeline",
      ask to: "projects/analytics:lead_data_agent", query: "Give me monthly churn", as: "churnData"
      vote in_forum: "curator://local/forums/rfc-p2p", ballot: "approve", rationale: "Validated"
      broadcast topic: "system:status", active: true
  `;
  const astVerbs: any = await compileCoffeeScriptToAST(coffeeVerbsCode);
  assert.equal(astVerbs.type, 'Curator_Sequential');
  assert.equal(astVerbs.subAgents.length, 3);
  assert.equal(astVerbs.subAgents[0].name, 'ask:projects/analytics:lead_data_agent');
  assert.equal(astVerbs.subAgents[1].name, 'vote:curator://local/forums/rfc-p2p');
  assert.equal(astVerbs.subAgents[2].name, 'broadcast:system:status');

  // Test 2: Chained fluent dialog builder
  const coffeeDialogCode = `
    dialog("curator://local/projects/backend:reviewer")
      .say("Please review my authentication PR")
      .propose(patch: "diff --git a/auth.ts b/auth.ts")
      .wait_reply()
  `;
  const astDialog: any = await compileCoffeeScriptToAST(coffeeDialogCode);
  assert.equal(astDialog.type, 'Curator_Sequential');
  assert.equal(astDialog.name, 'dialog:curator://local/projects/backend:reviewer');
  assert.ok(astDialog.subAgents.length >= 3);

  // Test 3: Chained fluent forum builder
  const coffeeForumCode = `
    forum("curator://local/forums/architecture")
      .join(role: "proposer")
      .propose(title: "Cross-Project SpeechActs")
      .await_quorum(targetVotes: 2)
      .synthesize(conclusion: "Adopted")
  `;
  const astForum: any = await compileCoffeeScriptToAST(coffeeForumCode);
  assert.equal(astForum.type, 'Curator_Sequential');
  assert.equal(astForum.name, 'forum:curator://local/forums/architecture');
  assert.ok(astForum.subAgents.length >= 4);
});

test('Plugins can register custom domain vocabularies that extend CoffeeScript', async () => {
  const { curatorEngine, compileCoffeeScriptToAST, CuratorBuilder } = await import('../../../curator/dist/src/index.js');

  // Register a custom plugin with domain-specific vocabularies
  curatorEngine.registerPlugin({
    name: 'legal-agreements',
    vocabularies: {
      tender_contract: (options: any) =>
        CuratorBuilder.seq(
          `tender:${options.contractId}`,
          CuratorBuilder.setState({ contractStatus: 'OFFERED', tenderValue: options.value }),
          CuratorBuilder.emitEvent('legal:contract:tendered', options)
        ),
      arbitrate_dispute: (disputeId: string) =>
        CuratorBuilder.forum(`curator://local/disputes/${disputeId}`).join({ role: 'arbitrator' }),
    },
  });

  // Verify that CoffeeScript immediately understands the newly registered domain verbs!
  const coffeeCustomCode = `
    seq "deal_closing",
      tender_contract contractId: "CNT-99", value: 500000
      arbitrate_dispute "DISP-12"
  `;

  const ast: any = await compileCoffeeScriptToAST(coffeeCustomCode);
  assert.equal(ast.type, 'Curator_Sequential');
  assert.equal(ast.name, 'deal_closing');
  assert.equal(ast.subAgents.length, 2);
  assert.equal(ast.subAgents[0].name, 'tender:CNT-99');
  assert.equal(ast.subAgents[1].name, 'forum:curator://local/disputes/DISP-12');
});

test('Classical discourse forms (soliloquy, monologue, trialogue, catechism, dialectic, apostrophe) compile to AST', async () => {
  const { compileCoffeeScriptToAST } = await import('../../../curator/dist/src/index.js');

  const coffeeCode = `
    seq "classical_discourse_pipeline",
      soliloquy "Considering whether to refactor the database schema"
      monologue "architecture:announcement", "Version 2.0 of the agent mesh is live"
      trialogue "architect", "reviewer", "security_audit"
      catechism "db_specialist", "What is the query plan for table X?"
      dialectic topic: "monolith_vs_microservices", thesis: "Keep unified runtime", antithesis: "Split into federated services"
      apostrophe "audit_ledger", "Permanent record of consensus hash: 0xabc123"
  `;

  const ast: any = await compileCoffeeScriptToAST(coffeeCode);
  assert.equal(ast.type, 'Curator_Sequential');
  assert.equal(ast.name, 'classical_discourse_pipeline');
  assert.equal(ast.subAgents.length, 6);
  assert.equal(ast.subAgents[0].name, 'soliloquy');
  assert.equal(ast.subAgents[1].name, 'monologue:architecture:announcement');
  assert.equal(ast.subAgents[2].name, 'trialogue:security_audit');
  assert.equal(ast.subAgents[3].name, 'ask:db_specialist');
  assert.equal(ast.subAgents[4].name, 'dialectic:monolith_vs_microservices');
  assert.equal(ast.subAgents[5].name, 'apostrophe:audit_ledger');
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
  await host.stop();
});

