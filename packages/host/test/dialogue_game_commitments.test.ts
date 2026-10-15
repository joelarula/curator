import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileCoffeeScriptToAST,
  game,
  interaction,
  trickster,
  propose_contract,
  accept_contract,
  reject_contract,
  assert_claim,
  query,
  execute_sync,
  violate_contract,
  fulfill_contract,
  rigged_proposal,
  feign_commitment,
} from '../../../curator/dist/src/index.js';

test('Dialogue Games & Public Commitment Store: Full Cooperative Cycle (PROPOSE -> ACCEPT -> EXECUTE_SYNC)', () => {
  const g = game('dungeon_raid:chamber_1')
    // 1. PROPOSE (Commissive/Directive): Scout proposes cooperative plan to Knight
    .propose_contract({
      commitmentId: 'plan_breach',
      as_role: 'scout',
      target_role: 'knight',
      action: 'defend_gate',
      condition: 'fetch_key',
      deadlineTick: 12,
    })
    // 2. QUERY (Deontic Obligation O(target, REPLY)): Knight asks for ammo status
    .query({
      predicate: 'has_ammunition',
      target_role: 'scout',
      as_role: 'knight',
    })
    // 3. ASSERT (Epistemic): Scout shares sensor scan
    .assert_claim({
      claim: 'north_corridor_clear',
      evidence_ref: 'sensor_scan_42',
      as_role: 'scout',
    })
    // 4. ACCEPT (Ratification): Knight ratifies the contract into active commitment
    .accept_contract({
      commitmentId: 'plan_breach',
      as_role: 'knight',
    })
    // 5. EXECUTE_SYNC (Coordinated Execution): Both agents execute synchronized action
    .execute_sync({
      actionId: 'synchronized_breach',
      actors: ['scout', 'knight'],
    });

  const ast = g.build();
  assert.equal(ast.type, 'Curator_Sequential');
  assert.equal(ast.subAgents.length, 10); // 5 operations * 2 (setState + emitEvent)

  const states = ast.subAgents.filter((s: any) => s.type === 'Curator_SetState');
  const events = ast.subAgents.filter((s: any) => s.type === 'Curator_EmitEvent');

  assert.equal(states.length, 5);
  assert.equal(events.length, 5);

  // 1. Verify PROPOSE state
  const proposeState = states[0].state;
  assert.equal(proposeState.currentPhase, 'STRATEGY');
  assert.equal(proposeState.proposalPending, true);
  assert.equal(proposeState.commitment_plan_breach.obligor, 'scout');
  assert.equal(proposeState.commitment_plan_breach.beneficiary, 'knight');
  assert.equal(proposeState.commitment_plan_breach.status, 'PENDING');
  assert.equal(proposeState.commitment_plan_breach.condition, 'fetch_key');

  const proposeEvent = events[0].payload;
  assert.equal(proposeEvent.speechAct, 'PROPOSE');
  assert.equal(proposeEvent.topic, 'dialogue:propose');

  // 2. Verify QUERY & Deontic Obligation
  const queryState = states[1].state;
  assert.equal(queryState.deonticObligation, 'O(scout, REPLY)');
  assert.equal(queryState.openQuestion, 'has_ammunition');

  const queryEvent = events[1].payload;
  assert.equal(queryEvent.speechAct, 'QUERY');
  assert.equal(queryEvent.topic, 'dialogue:query');

  // 3. Verify ASSERT claim
  const assertState = states[2].state;
  assert.equal(assertState.informPending, true);
  assert.equal(assertState.lastAssertion, 'north_corridor_clear');

  const assertEvent = events[2].payload;
  assert.equal(assertEvent.speechAct, 'ASSERT');
  assert.equal(assertEvent.topic, 'dialogue:assert');

  // 4. Verify ACCEPT & Contract Ratification
  const acceptState = states[3].state;
  assert.equal(acceptState.currentPhase, 'EXECUTION');
  assert.equal(acceptState.contractActive, true);
  assert.equal(acceptState.commitment_plan_breach_status, 'RATIFIED');

  const acceptEvent = events[3].payload;
  assert.equal(acceptEvent.speechAct, 'ACCEPT');
  assert.equal(acceptEvent.topic, 'dialogue:accept');

  // 5. Verify EXECUTE_SYNC
  const syncState = states[4].state;
  assert.equal(syncState.currentPhase, 'IDLE');
  assert.equal(syncState.contractActive, false);
  assert.equal(syncState.commitmentsFulfilled, true);
  assert.equal(syncState.lastSyncExecution, 'synchronized_breach');

  const syncEvent = events[4].payload;
  assert.equal(syncEvent.topic, 'dialogue:execute_sync');
  assert.deepEqual(syncEvent.payload.actors, ['scout', 'knight']);
});

test('Public Commitment Store: Defection & Betrayal Tracking with Reputation Penalty', () => {
  const g = interaction('collab_arena')
    .propose_contract({
      commitmentId: 'defend_flank',
      as_role: 'rogue',
      target_role: 'paladin',
      action: 'guard_rear',
    })
    .accept_contract({
      commitmentId: 'defend_flank',
      as_role: 'paladin',
    })
    // Defection occurs: Rogue fails to guard rear
    .violate_contract({
      commitmentId: 'defend_flank',
      actor: 'rogue',
      defectionReason: 'fled_from_battle',
      reputationPenalty: 25,
    });

  const ast = g.build();
  const states = ast.subAgents.filter((s: any) => s.type === 'Curator_SetState');
  const events = ast.subAgents.filter((s: any) => s.type === 'Curator_EmitEvent');

  // Verify Defection state
  const defectState = states[2].state;
  assert.equal(defectState.currentPhase, 'ARBITRATION');
  assert.equal(defectState.defectionDetected, true);
  assert.equal(defectState.defector, 'rogue');
  assert.equal(defectState.reputationPenalty, 25);
  assert.equal(defectState.commitment_defend_flank_status, 'VIOLATED');

  const defectEvent = events[2].payload;
  assert.equal(defectEvent.speechAct, 'REJECT');
  assert.equal(defectEvent.topic, 'dialogue:defection');
  assert.equal(defectEvent.payload.defector, 'rogue');
  assert.equal(defectEvent.payload.reputationPenalty, 25);
});

test('Trickster Mechanics: Conditional Ambiguity & Feigned Commitment', () => {
  const t = trickster('council_hall', 'loki')
    // Trickster issues a rigged proposal with a paradoxical precondition phi
    .rigged_proposal({
      commitmentId: 'divine_pact',
      target_role: 'odin',
      apparentAction: 'build_asgard_walls',
      hiddenClause: 'only_if_sun_and_moon_are_delivered',
    })
    // Trickster feigns commitment to the mortal agreement
    .feign_commitment({
      commitmentId: 'mortal_oath',
      hiddenMotive: 'induce_unreversible_stake',
    });

  const ast = t.build();
  assert.equal(ast.type, 'Curator_Sequential');
  const states = ast.subAgents.filter((s: any) => s.type === 'Curator_SetState');

  const riggedState = states[0].state;
  assert.equal(riggedState.tricksterAction, 'RIGGED_PROPOSAL');
  assert.equal(riggedState.commitment_divine_pact.isRigged, true);
  assert.equal(riggedState.commitment_divine_pact.condition, 'only_if_sun_and_moon_are_delivered');

  const feignedState = states[1].state;
  assert.equal(feignedState.tricksterAction, 'FEIGNED_COMMITMENT');
  assert.equal(feignedState.feignedCommitment, true);
  assert.equal(feignedState.hiddenMotive, 'induce_unreversible_stake');
});

test('CoffeeScript DSL Compilation: Turn-Contract Dialogue Game in CoffeeScript', async () => {
  const script = `
interaction('squad_ops')
  .propose_contract(commitmentId: 'bridge_assault', as_role: 'leader', target_role: 'sniper', action: 'provide_overwatch')
  .query(predicate: 'target_in_range', as_role: 'leader', target_role: 'sniper')
  .assert_claim(claim: 'target_acquired', evidence_ref: 'optic_lock', as_role: 'sniper')
  .accept_contract(commitmentId: 'bridge_assault', as_role: 'sniper')
  .execute_sync(actionId: 'simultaneous_breach', actors: ['leader', 'sniper'])
`;

  const ast: any = await compileCoffeeScriptToAST(script);
  assert.ok(ast);
  assert.equal(ast.type, 'Curator_Sequential');
  assert.equal(ast.subAgents.length, 10);

  const stateNodes = ast.subAgents.filter((s: any) => s.type === 'Curator_SetState');
  assert.equal(stateNodes[0].state.proposalPending, true);
  assert.equal(stateNodes[0].state.commitment_bridge_assault.obligor, 'leader');
  assert.equal(stateNodes[1].state.deonticObligation, 'O(sniper, REPLY)');
  assert.equal(stateNodes[2].state.lastAssertion, 'target_acquired');
  assert.equal(stateNodes[3].state.commitment_bridge_assault_status, 'RATIFIED');
  assert.equal(stateNodes[4].state.commitmentsFulfilled, true);
});
