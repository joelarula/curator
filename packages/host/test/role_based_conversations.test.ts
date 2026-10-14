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

test('Dynamic Deliberation: Compiles real-time protocol harness to valid execution AST', async () => {
  const script = `
seq 'engineering_rfc_deliberation',
  # 1. Proposer drafts the proposal dynamically
  ask to: '@role:proposer', query: 'Draft RFC-101 for vector indexing', as: 'proposal'
  propose in_forum: 'engineering_rfc_room', topic: 'RFC-101', patch: '$context.proposal'

  # 2. Critic reviews and responds in real-time
  ask to: '@role:critic', query: 'Critique proposal: $context.proposal', as: 'critique'
  inform in_forum: 'engineering_rfc_room', payload: '$context.critique'

  # 3. Conditional rebuttal: if Critic raised concerns, allow Proposer 1 revision
  if_else '$context.critique.hasObjections',
    seq 'revision_round',
      ask to: '@role:proposer', query: 'Address critique: $context.critique', as: 'revision'
      inform in_forum: 'engineering_rfc_room', payload: '$context.revision'

  # 4. Solicit votes concurrently from the committee
  parallel 'voting_round',
    ask to: '@role:critic', query: 'Cast vote on RFC-101: $context.proposal', as: 'vote_critic'
    ask to: '@role:proposer', query: 'Cast vote on RFC-101: $context.proposal', as: 'vote_proposer'

  # 5. Chair synthesizes the outcome from actual votes
  ask to: '@role:chair', query: 'Synthesize consensus from $context.vote_critic and $context.vote_proposer', as: 'verdict'
  synthesize in_forum: 'engineering_rfc_room', summary: '$context.verdict'
`;

  const ast: any = await compileCoffeeScriptToAST(script);
  assert.equal(ast.type, 'Curator_Sequential');
  assert.equal(ast.name, 'engineering_rfc_deliberation');

  // Verify child steps: ask(1), propose(2), ask(3), inform(4), if_else(5), parallel(6), ask(7), synthesize(8)
  assert.equal(ast.subAgents.length, 8);

  // Step 1: ask proposer
  assert.equal(ast.subAgents[0].name, 'ask:@role:proposer');

  // Step 2: propose in_forum
  assert.equal(ast.subAgents[1].name, 'propose:RFC-101');

  // Step 4: inform in_forum
  assert.equal(ast.subAgents[3].name, 'inform:engineering_rfc_room');

  // Step 5: if_else condition
  assert.equal(ast.subAgents[4].type, 'Curator_IfElse');
  assert.equal(ast.subAgents[4].condition, '$context.critique.hasObjections');

  // Step 6: parallel voting round
  assert.equal(ast.subAgents[5].type, 'Curator_Parallel');
  assert.equal(ast.subAgents[5].name, 'voting_round');
  assert.equal(ast.subAgents[5].subAgents.length, 2);

  // Step 8: synthesize in_forum
  assert.equal(ast.subAgents[7].name, 'synthesize:engineering_rfc_room');
});
