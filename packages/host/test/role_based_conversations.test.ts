import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileCoffeeScriptToAST,
  CuratorBuilder,
  ConversationRouter,
  as_role,
  role,
  dialog,
  forum,
  ask,
  propose,
  inform,
  vote,
  synthesize,
} from '../../../curator/dist/src/index.js';

test('Role-Based Scripts: CoffeeScript compiles scoped as_role and speech acts', async () => {
  const script = `
as_role 'proposer', ->
  seq 'rfc_submission',
    inform to_role: 'chair', topic: 'session:open', payload: { ready: true }
    propose to_role: 'critic', topic: 'RFC-42', patch: { diff: 'fix' }
`;

  const ast: any = await compileCoffeeScriptToAST(script);
  assert.equal(ast.type, 'Curator_Sequential');
  assert.equal(ast.name, 'role:proposer');

  // Verify first step sets senderRole in context state
  const firstChild = ast.subAgents[0];
  assert.equal(firstChild.type, 'Curator_SetState');
  assert.equal(firstChild.state.senderRole, 'proposer');

  // Verify nested sequence contains inform and propose with role tags
  const nestedSeq = ast.subAgents[1];
  assert.equal(nestedSeq.name, 'rfc_submission');
  const informSeq = nestedSeq.subAgents[0];
  assert.equal(informSeq.subAgents[0].type, 'Curator_EmitEvent');
  assert.equal(informSeq.subAgents[0].payload.targetRole, 'chair');

  const proposeSeq = nestedSeq.subAgents[1];
  assert.equal(proposeSeq.subAgents[1].type, 'Curator_EmitEvent');
  assert.equal(proposeSeq.subAgents[1].payload.speechAct, 'PROPOSE');
  assert.equal(proposeSeq.subAgents[1].payload.targetRole, 'critic');
});

test('Role-Based Scripts: Fluent DialogBuilder supports conversational roles', () => {
  const b = dialog({ role: 'architect', as_role: 'developer' })
    .say('Can we review this schema?')
    .wait_reply('architect_reply')
    .build();

  assert.equal(b.type, 'Curator_Sequential');
  assert.equal(b.name, 'dialog:@role:architect');

  const emitStep: any = b.subAgents[0];
  assert.equal(emitStep.type, 'Curator_EmitEvent');
  assert.equal(emitStep.payload.targetRole, 'architect');
  assert.equal(emitStep.payload.senderRole, 'developer');
  assert.equal(emitStep.payload.target, '@role:architect');
});

test('Role-Based Scripts: Fluent ForumBuilder joins, votes, and deliberates with conversational roles', async () => {
  const script = `
forum('curator://forums/rfc-99')
  .join(role: 'evaluator')
  .vote('approve', rationale: 'Meets criteria')
`;

  const ast: any = await compileCoffeeScriptToAST(script);
  assert.equal(ast.type, 'Curator_Sequential');
  assert.equal(ast.name, 'forum:curator://forums/rfc-99');

  const joinStep: any = ast.subAgents[0];
  assert.equal(joinStep.payload.speechAct, 'REQUEST');
  assert.equal(joinStep.payload.senderRole, 'evaluator');

  const voteStep: any = ast.subAgents[1];
  assert.equal(voteStep.payload.speechAct, 'VOTE');
  assert.equal(voteStep.payload.senderRole, 'evaluator');
  assert.equal(voteStep.payload.payload.ballot, 'approve');
});

test('Role-Based Scripts: role() factory binds conversational role to operations', () => {
  const reviewer = role('reviewer');
  const askStep = reviewer.ask({ to: 'agent_alpha', query: 'Is this ready?' });

  assert.equal(askStep.type, 'Curator_Sequential');
  const emitStep: any = askStep.subAgents[1];
  assert.equal(emitStep.payload.senderRole, 'reviewer');
});

test('ConversationRouter: Resolves conversational roles without conflating with RBAC permission roles', async () => {
  const router = new ConversationRouter({ localNodeId: 'node-1' });

  let receivedEnvelope: any = null;
  router.registerLocalAgent('@role:critic', (envelope) => {
    receivedEnvelope = envelope;
  });

  // Outbound message to an abstract conversational role
  await router.routeOutbound({
    conversationId: 'conv_deliberation',
    conversationType: 'dialog',
    speechAct: 'PROPOSE',
    senderRole: 'author',
    to_role: 'critic',
    payload: { proposal: 'Refactor AST' },
  });

  assert.ok(receivedEnvelope, 'Handler for @role:critic should receive message');
  assert.equal(receivedEnvelope.sender.conversationalRole, 'author');
  assert.equal(receivedEnvelope.recipients[0].conversationalRole, 'critic');
});
