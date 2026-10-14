import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CuratorEngine,
  interactionPlugin,
  tabletopPlugin,
  compileCoffeeScriptToAST,
  UNIVERSAL_INTERACTION_MATRIX,
  getInteractionPrimitiveDefinition,
  isValidInteractionTransition,
  interaction,
  ritual,
  theater,
  protocol,
  game,
} from '../../../curator/dist/src/index.js';

test('Universal Interaction Matrix: 6 Core Primitives, Theoretical Roots & Cross-Domain Analogs', () => {
  // 1. Frame & Boundary (The Container)
  const p1 = UNIVERSAL_INTERACTION_MATRIX.FRAME_BOUNDARY;
  assert.equal(p1.primitiveNumber, 1);
  assert.equal(p1.name, 'Frame & Boundary (The Container)');
  assert.equal(p1.playerAgency, 'framing_contractual');
  assert.ok(p1.theoreticalRoots.some((r: string) => r.includes('Goffman')));
  assert.ok(p1.theoreticalRoots.some((r: string) => r.includes('Huizinga')));
  assert.equal(p1.analogs.bracket.cardGame, 'Shuffling & dealing');
  assert.equal(p1.analogs.bracket.speechActConversation, 'Clearing throat, "Can we talk?"');
  assert.equal(p1.analogs.bracket.ritualHabit, 'Crossing threshold, ringing a bell');
  assert.equal(p1.analogs.bracket.politicalTheaterCourtroom, 'Gavel strike, "All rise for the court"');

  // 2. Posturing & Assertion (Claiming Reality)
  const p2 = UNIVERSAL_INTERACTION_MATRIX.POSTURING_ASSERTION;
  assert.equal(p2.primitiveNumber, 2);
  assert.equal(p2.name, 'Posturing & Assertion (Claiming Reality)');
  assert.equal(p2.playerAgency, 'strategic_assertion');
  assert.ok(p2.theoreticalRoots.some((r: string) => r.includes('Costly Signaling')));
  assert.equal(p2.analogs.bid.cardGame, 'Placing a lead card, bidding trump');
  assert.equal(p2.analogs.bid.speechActConversation, 'Asking a leading question, proposing agenda');
  assert.equal(p2.analogs.bid.ritualHabit, 'Offering an opening prayer / greeting');

  // 3. Yielding & Contestation (Managing Collision)
  const p3 = UNIVERSAL_INTERACTION_MATRIX.YIELDING_CONTESTATION;
  assert.equal(p3.primitiveNumber, 3);
  assert.equal(p3.name, 'Yielding & Contestation (Managing Collision)');
  assert.equal(p3.playerAgency, 'contestation_negotiation');
  assert.ok(p3.theoreticalRoots.some((r: string) => r.includes('Ethnomethodology')));
  assert.equal(p3.analogs.challenge.cardGame, 'Calling a bluff ("Bullshit")');
  assert.equal(p3.analogs.challenge.speechActConversation, 'Pointing out contradiction, calling foul');
  assert.equal(p3.analogs.challenge.ritualHabit, 'Calling out heresy or taboo violation');
  assert.equal(p3.analogs.challenge.politicalTheaterCourtroom, '"Objection your honor!", committee subpoena');

  // 4. Verification & Revelation (Collapsing Entropy)
  const p4 = UNIVERSAL_INTERACTION_MATRIX.VERIFICATION_REVELATION;
  assert.equal(p4.primitiveNumber, 4);
  assert.equal(p4.name, 'Verification & Revelation (Collapsing Entropy)');
  assert.equal(p4.playerAgency, 'revealing_truth');
  assert.equal(p4.analogs.expose.cardGame, 'Showdown (cards tabled on felt)');
  assert.equal(p4.analogs.expose.speechActConversation, 'Producing proof, confessing secret');
  assert.equal(p4.analogs.ratify.ritualHabit, 'Pronouncing: "I now pronounce you...", Amen');
  assert.equal(p4.analogs.ratify.politicalTheaterCourtroom, 'Foreman reading verdict, signing treaty into law');

  // 5. Settlement & Accounting (State Rebalance)
  const p5 = UNIVERSAL_INTERACTION_MATRIX.SETTLEMENT_ACCOUNTING;
  assert.equal(p5.primitiveNumber, 5);
  assert.equal(p5.name, 'Settlement & Accounting (State Rebalance)');
  assert.equal(p5.playerAgency, 'state_rebalance');
  assert.ok(p5.theoreticalRoots.some((r: string) => r.includes('Bourdieu')));
  assert.equal(p5.analogs.levy.speechActConversation, 'Losing face, social shame, retraction');
  assert.equal(p5.analogs.clear.ritualHabit, 'Parting blessing, saying "Amen", washing hands');

  // 6. Meta-Acts (Rules of the Rule-Set)
  const p6 = UNIVERSAL_INTERACTION_MATRIX.META_ACTS;
  assert.equal(p6.primitiveNumber, 6);
  assert.equal(p6.name, 'Meta-Acts (Rules of the Rule-Set)');
  assert.equal(p6.playerAgency, 'meta_repair_or_rupture');
  assert.ok(p6.theoreticalRoots.some((r: string) => r.includes('Garfinkel')));
  assert.equal(p6.analogs.repair.cardGame, 'Calling a misdeal, floor judge ruling');
  assert.equal(p6.analogs.repair.speechActConversation, '"Sorry, that came out wrong", "Let me rephrase"');
  assert.equal(p6.analogs.rupture.cardGame, 'Table flip, refusing to pay, walking away');
  assert.equal(p6.analogs.rupture.speechActConversation, 'Hanging up phone, storming out of room');

  // Transition Validations
  assert.equal(isValidInteractionTransition('FRAME_BOUNDARY', 'POSTURING_ASSERTION'), true);
  assert.equal(isValidInteractionTransition('POSTURING_ASSERTION', 'YIELDING_CONTESTATION'), true);
  assert.equal(isValidInteractionTransition('YIELDING_CONTESTATION', 'POSTURING_ASSERTION'), true); // Tight negotiation
  assert.equal(isValidInteractionTransition('YIELDING_CONTESTATION', 'VERIFICATION_REVELATION'), true);
  assert.equal(isValidInteractionTransition('VERIFICATION_REVELATION', 'SETTLEMENT_ACCOUNTING'), true);
  assert.equal(isValidInteractionTransition('SETTLEMENT_ACCOUNTING', 'FRAME_BOUNDARY'), true); // New cycle
  assert.equal(isValidInteractionTransition('POSTURING_ASSERTION', 'META_ACTS'), true); // Repair or rupture anytime
  assert.equal(isValidInteractionTransition('META_ACTS', 'SETTLEMENT_ACCOUNTING'), true);
});

test('Courtroom Theater & Legal Interaction Order: Compiles to valid execution AST', async () => {
  const script = `
theater('courtroom_01')
  .bracket(frame: 'courtroom', ruleset: 'rules_of_evidence')
  .stance('adversarial', as_role: 'defense')
  .stake(collateralType: 'social_face', collateral: 'reputation', as_role: 'prosecutor')
  .gambit(as_role: 'prosecutor', move: 'opening_statement')
  .signal(as_role: 'witness', signalType: 'costly', claim: 'eyewitness_account')
  .challenge(as_role: 'defense', interrogation: 'contradiction_in_timeline')
  .repair(as_role: 'prosecutor', adjustment: 'withdrawing_improper_phrase')
  .expose(as_role: 'defense', evidence: 'traffic_cam_footage')
  .ratify(as_role: 'judge', verdict: 'not_guilty')
  .levy(as_role: 'clerk', target_role: 'plaintiff', penalty: 'court_costs', amount: 350)
  .clear(as_role: 'bailiff', scope: 'session_adjourned')
`;

  const ast: any = await compileCoffeeScriptToAST(script);
  assert.equal(ast.type, 'Curator_Sequential');
  assert.equal(ast.name, 'theater:courtroom_01');

  // Verify Bracket
  const bracketState = ast.subAgents[0];
  assert.equal(bracketState.state.interactionPrimitive, 'FRAME_BOUNDARY');
  assert.equal(bracketState.state.magicCircle, true);
  assert.equal(bracketState.state.frame, 'courtroom');

  const bracketEmit = ast.subAgents[1];
  assert.equal(bracketEmit.payload.topic, 'interaction:bracket');

  // Verify Stance
  const stanceState = ast.subAgents[2];
  assert.equal(stanceState.state.stance, 'adversarial');

  // Verify Stake
  const stakeState = ast.subAgents[4];
  assert.equal(stakeState.state.collateralType, 'social_face');

  // Verify Gambit & Signal
  const gambitEmit = ast.subAgents[7];
  assert.equal(gambitEmit.payload.speechAct, 'PROPOSE');
  assert.equal(gambitEmit.payload.topic, 'interaction:gambit');

  const signalEmit = ast.subAgents[9];
  assert.equal(signalEmit.payload.speechAct, 'ASSERT');
  assert.equal(signalEmit.payload.topic, 'interaction:posture');

  // Verify Challenge (Contestation)
  const challengeEmit = ast.subAgents[11];
  assert.equal(challengeEmit.payload.speechAct, 'VOTE');
  assert.equal(challengeEmit.payload.topic, 'contestation:challenge');

  // Verify Repair (Meta-Act)
  const repairState = ast.subAgents[12];
  assert.equal(repairState.state.interactionPrimitive, 'META_ACTS');
  assert.equal(repairState.state.interactionAct, 'repair');

  // Verify Expose & Ratify
  const exposeEmit = ast.subAgents[15];
  assert.equal(exposeEmit.payload.topic, 'interaction:expose');

  const ratifyEmit = ast.subAgents[17];
  assert.equal(ratifyEmit.payload.topic, 'interaction:ratify');
  assert.equal(ratifyEmit.payload.payload.verdict, 'not_guilty');

  // Verify Levy & Clear
  const levyEmit = ast.subAgents[19];
  assert.equal(levyEmit.payload.topic, 'interaction:levy');
  assert.equal(levyEmit.payload.payload.penalty, 'court_costs');

  const clearEmit = ast.subAgents[21];
  assert.equal(clearEmit.payload.topic, 'interaction:clear');
});

test('Ritual & Sacred Habit: Compiles Liturgical Sequence to Execution AST', async () => {
  const script = `
ritual('sanctuary_altar')
  .bracket(frame: 'sacred_liturgy')
  .stance('solemn', as_role: 'celebrant')
  .stake(collateralType: 'sacred_pledge', collateral: 'vow_of_fidelity')
  .gambit(as_role: 'celebrant', move: 'opening_prayer')
  .signal(as_role: 'congregation', signalType: 'costly', declaration: 'austere_silence')
  .check(as_role: 'celebrant', note: 'liturgical_pause')
  .expose(as_role: 'celebrant', evidence: 'holy_sacrament')
  .ratify(as_role: 'celebrant', verdict: 'consecrated')
  .clear(as_role: 'celebrant', scope: 'amen_and_parting_blessing')
`;

  const ast: any = await compileCoffeeScriptToAST(script);
  assert.equal(ast.type, 'Curator_Sequential');
  assert.equal(ast.name, 'ritual:sanctuary_altar');

  const stanceState = ast.subAgents[2];
  assert.equal(stanceState.state.stance, 'solemn');

  const stakeState = ast.subAgents[4];
  assert.equal(stakeState.state.collateralType, 'sacred_pledge');

  const ratifyEmit = ast.subAgents[15];
  assert.equal(ratifyEmit.payload.topic, 'interaction:ratify');
  assert.equal(ratifyEmit.payload.payload.verdict, 'consecrated');
});

test('High-Stakes Diplomatic Rupture (Spoilsporting / Frame Breach): Compiles to Execution AST', async () => {
  const script = `
seq 'diplomatic_summit',
  bracket container: 'summit_room', frame: 'bilateral_negotiation'
  stance alignment: 'transactional'
  stake collateralType: 'material', amount: 1000000
  gambit as_role: 'ambassador_a', move: 'demilitarized_zone_proposal'
  raise as_role: 'ambassador_b', friction: 'increased_border_patrols'
  rupture as_role: 'ambassador_a', breachType: 'walkout', reason: 'unacceptable_provocation'
`;

  const ast: any = await compileCoffeeScriptToAST(script);
  assert.equal(ast.type, 'Curator_Sequential');
  assert.equal(ast.name, 'diplomatic_summit');

  // Verify Bracket
  const bracketSeq = ast.subAgents[0];
  assert.equal(bracketSeq.subAgents[0].state.interactionPrimitive, 'FRAME_BOUNDARY');

  // Verify Raise / Escalation
  const raiseSeq = ast.subAgents[4];
  assert.equal(raiseSeq.subAgents[0].state.interactionPrimitive, 'POSTURING_ASSERTION');
  assert.equal(raiseSeq.subAgents[1].payload.topic, 'wager:raise');

  // Verify Rupture (Frame Breach)
  const ruptureSeq = ast.subAgents[5];
  assert.equal(ruptureSeq.subAgents[0].state.interactionPrimitive, 'META_ACTS');
  assert.equal(ruptureSeq.subAgents[0].state.ruptureStatus, 'FRAME_BROKEN');
  assert.equal(ruptureSeq.subAgents[1].payload.speechAct, 'REJECT');
  assert.equal(ruptureSeq.subAgents[1].payload.payload.breachType, 'walkout');
});

test('Everyday Conversation & Conversational Repair: Adjacency Pairs & Micro-adjustments', async () => {
  const script = `
seq 'coffee_banter',
  bracket container: 'cafe_table', frame: 'casual_chat'
  stance alignment: 'playful'
  gambit as_role: 'alice', move: 'teasing_joke'
  defer as_role: 'alice', to_role: 'bob'
  repair as_role: 'alice', adjustment: 'sorry_that_came_out_wrong_let_me_rephrase'
  posture as_role: 'bob', signalType: 'cheap_talk', declaration: 'no_offense_taken'
  clear as_role: 'alice', scope: 'mutual_laughter'
`;

  const ast: any = await compileCoffeeScriptToAST(script);
  assert.equal(ast.type, 'Curator_Sequential');

  // Defer passes initiative
  const deferSeq = ast.subAgents[3];
  assert.equal(deferSeq.subAgents[0].state.deferredTo, 'bob');

  // Repair
  const repairSeq = ast.subAgents[4];
  assert.equal(repairSeq.subAgents[0].state.interactionPrimitive, 'META_ACTS');
  assert.equal(repairSeq.subAgents[1].payload.topic, 'interaction:repair');

  // Clear
  const clearSeq = ast.subAgents[6];
  assert.equ