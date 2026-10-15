import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CuratorEngine,
  interactionPlugin,
  tabletopPlugin,
  compileCoffeeScriptToAST,
  FluentGameBuilder,
  FluentTricksterBuilder,
  DEVIANT_ARCHETYPE_MATRIX,
  getDeviantArchetypeDefinition,
  trickster,
  interaction,
  hijack_frame,
  feign_stance,
  asymmetric_buy_in,
  hyper_comply,
  literal_gambit,
  counterfeit_signal,
  bait_escalation,
  deflect_challenge,
  parody_yield,
  ungraspable_check,
  staged_expose,
  refuse_ratification,
  evade_toll,
  invert_value,
  creative_rupture,
  forced_repair,
} from '../../../curator/dist/src/index.js';

test('Deviant Archetype Matrix: Cheater vs Spoilsport vs Trickster formal deconstruction', () => {
  // 1. Cheater
  const cheater = DEVIANT_ARCHETYPE_MATRIX.CHEATER;
  assert.equal(cheater.archetype, 'CHEATER');
  assert.equal(cheater.relationToFrame, 'Respects it secretly; needs it to profit');
  assert.equal(cheater.stance, 'Compliant outwardly');
  assert.equal(cheater.targetOfAttack, 'The score / resource bank');
  assert.equal(cheater.showdownOutcome, 'Shame, disqualification, or illicit win');
  assert.equal(cheater.systemicResult, 'Corrupts the ledger');

  // 2. Spoilsport / Vandal
  const spoilsport = DEVIANT_ARCHETYPE_MATRIX.SPOILSPORT;
  assert.equal(spoilsport.archetype, 'SPOILSPORT');
  assert.equal(spoilsport.relationToFrame, 'Despises it; breaks it down out of spite');
  assert.equal(spoilsport.stance, 'Hostile / Refusal');
  assert.equal(spoilsport.targetOfAttack, "The game's existence");
  assert.equal(spoilsport.showdownOutcome, 'Halts the game completely');
  assert.equal(spoilsport.systemicResult, 'Destroys the ledger');

  // 3. Trickster
  const tricksterArchetype = DEVIANT_ARCHETYPE_MATRIX.TRICKSTER;
  assert.equal(tricksterArchetype.archetype, 'TRICKSTER');
  assert.equal(tricksterArchetype.relationToFrame, 'Dances on its boundary; bends it into a mirror');
  assert.equal(tricksterArchetype.stance, 'Hyper-playful / Feigned innocence');
  assert.equal(tricksterArchetype.targetOfAttack, "The players' unexamined assumptions");
  assert.equal(tricksterArchetype.showdownOutcome, 'Humiliates the authority, rewrites the game');
  assert.equal(tricksterArchetype.systemicResult, 'Forces the system to evolve');

  // Helper function lookup
  assert.equal(getDeviantArchetypeDefinition('TRICKSTER').targetOfAttack, "The players' unexamined assumptions");
  assert.equal(getDeviantArchetypeDefinition('CHEATER').targetOfAttack, 'The score / resource bank');
});

test('FluentTricksterBuilder: 6 Primitives of Semiotic Sabotage and Meta-Operations', () => {
  const loki = trickster('asgard:feast', 'loki')
    // 1. Frame & Bracket: Smuggle mortal stakes into solemn feast with feigned piety
    .feign_stance({
      apparentStance: 'devout_humility',
      pietyLevel: 'absolute',
      innerIntent: 'expose_vanity_of_the_gods',
    })
    .hijack_frame({
      newFrame: 'mortal_wager',
      smuggledStakes: 'divine_immortality',
    })
    .asymmetric_buy_in({
      target_role: 'thor',
      opponentStake: 'mjolnir_and_pride',
      selfStake: 'a_wisp_of_hair',
      bait: 'Prove you can lift what a commoner can lift',
    })
    // 2. Posturing & Assertion: Malicious hyper-compliance & counterfeit signaling
    .counterfeit_signal({
      projectedPosture: 'defenseless_cowardice',
      actualCost: 0,
      targetBelief: 'Thor assumes easy victory',
    })
    .bait_escalation({
      target_role: 'thor',
      baitTarget: 'vanity',
      provocation: 'Surely the God of Thunder does not fear a mortal cat?',
    })
    .hyper_comply({
      command: 'Thor orders Loki to pour the drink to the very brim',
      literalInterpretation: 'Pours until the entire mead-hall is submerged in mead',
      exposedAssumption: 'Commands must contain unwritten boundaries of moderation',
    })
    // 3. Contestation & Yielding: Deflect challenge, parody yield & ungraspable check
    .deflect_challenge({
      challenger: 'odin',
      redefinition: 'I did not spill the mead; the horn simply could not contain the ocean of your greatness',
    })
    .parody_yield({
      theatrics: 'Prostrates on the floor, weeping dramatics of exaggerated repentance',
      hiddenMotive: 'Steal the keys to the Bifrost while everyone looks at the performance',
    })
    .ungraspable_check({
      riddle: 'What gets wetter the more it dries?',
      evasion: 'Bursts into laughter and refuses to give a binary answer',
    })
    // 4. Verification & Revelation: Staged ambush expose & refusal of ratification
    .staged_expose({
      exposedRole: 'thor',
      targetHypocrisy: 'Thor was wrestling Old Age itself; his physical strength is futile against time',
      escapeRoute: 'Transforms into a salmon and leaps into the waterfall',
    })
    .refuse_ratification({
      dismissalReason: 'It was only an illusion anyway',
      partingMockery: 'You cannot defeat what was never truly fought',
    })
    // 5. Settlement & Accounting: Toll evasion and value inversion
    .evade_toll({
      penaltyEvaded: 'Execution',
      stageTurned: true,
      reinterpretation: 'Declared that you may sew my lips, but you cannot touch my neck',
    })
    .invert_value({
      originalCurrency: 'Divine Gold',
      invertedValue: 'Dry withered oak leaves',
      absurdityRatio: 'infinite',
    })
    // 6. Meta-Acts: Creative rupture and forced repair
    .creative_rupture({
      shatteredIllusion: 'Reveals the mead hall walls are painted parchment',
      revelation: 'Order without play is mere tyranny',
    })
    .forced_repair({
      unexaminedAssumption: 'Gods are omnipotent and above cosmic humor',
      newRule: 'Henceforth all divine decrees must be reviewed by the Fool',
      evolutionaryOutcome: 'Asgard embraces self-critique',
    });

  const ast = loki.build();
  assert.equal(ast.type, 'Curator_Sequential');
  assert.ok(ast.name.includes('trickster:loki:asgard:feast'));
  assert.equal(ast.subAgents.length, 30); // 15 operations * 2 nodes each (setState + emitEvent)

  // Verify specific state nodes
  const states = ast.subAgents.filter((c: any) => c.type === 'Curator_SetState');
  const events = ast.subAgents.filter((c: any) => c.type === 'Curator_EmitEvent');

  assert.equal(states.length, 15);
  assert.equal(events.length, 15);

  // Check Primitive 1: Perverse stance & Frame hijack
  const stanceState = states[0].state;
  assert.equal(stanceState.interactionPrimitive, 'FRAME_BOUNDARY');
  assert.equal(stanceState.tricksterAction, 'PERVERSE_STANCE');
  assert.equal(stanceState.apparentStance, 'devout_humility');

  const hijackState = states[1].state;
  assert.equal(hijackState.interactionPrimitive, 'FRAME_BOUNDARY');
  assert.equal(hijackState.tricksterAction, 'FRAME_HIJACK');
  assert.equal(hijackState.frameHijacked, true);

  // Check Primitive 2: Malicious hyper-compliance
  const hyperComplyState = states[5].state;
  assert.equal(hyperComplyState.interactionPrimitive, 'POSTURING_ASSERTION');
  assert.equal(hyperComplyState.tricksterAction, 'MALICIOUS_HYPER_COMPLIANCE');
  assert.equal(hyperComplyState.exposedAssumption, 'Commands must contain unwritten boundaries of moderation');

  // Check Primitive 3: Challenge deflection & Ungraspable check
  const deflectState = states[6].state;
  assert.equal(deflectState.interactionPrimitive, 'YIELDING_CONTESTATION');
  assert.equal(deflectState.tricksterAction, 'DEFLECT_CHALLENGE');
  assert.equal(deflectState.challengeDeflected, true);

  const checkState = states[8].state;
  assert.equal(checkState.interactionPrimitive, 'YIELDING_CONTESTATION');
  assert.equal(checkState.tricksterAction, 'UNGRASPABLE_CHECK');
  assert.equal(checkState.feedbackLoopStarved, true);

  // Check Primitive 4: Staged expose
  const exposeState = states[9].state;
  assert.equal(exposeState.interactionPrimitive, 'VERIFICATION_REVELATION');
  assert.equal(exposeState.tricksterAction, 'STAGED_EXPOSE');
  assert.equal(exposeState.exposedHypocrite, 'thor');

  // Check Primitive 5: Toll evasion & Value inversion
  const tollState = states[11].state;
  assert.equal(tollState.interactionPrimitive, 'SETTLEMENT_ACCOUNTING');
  assert.equal(tollState.tricksterAction, 'TOLL_EVASION');
  assert.equal(tollState.tollPaid, false);
  assert.equal(tollState.cageTurnedToStage, true);

  const valState = states[12].state;
  assert.equal(valState.interactionPrimitive, 'SETTLEMENT_ACCOUNTING');
  assert.equal(valState.tricksterAction, 'VALUE_INVERSION');
  assert.equal(valState.goldToLeaves, true);

  // Check Primitive 6: Creative rupture & Forced repair
  const ruptureState = states[13].state;
  assert.equal(ruptureState.interactionPrimitive, 'META_ACTS');
  assert.equal(ruptureState.tricksterAction, 'CREATIVE_RUPTURE');
  assert.equal(ruptureState.illusionShattered, 'Reveals the mead hall walls are painted parchment');

  const repairState = states[14].state;
  assert.equal(repairState.interactionPrimitive, 'META_ACTS');
  assert.equal(repairState.tricksterAction, 'FORCED_REPAIR');
  assert.equal(repairState.systemicEvolution, true);
  assert.equal(repairState.newRule, 'Henceforth all divine decrees must be reviewed by the Fool');

});

test('Standalone Composable Functions: Calling trickster verbs directly', () => {
  // Test standalone composables with explicit role and table
  const hijackNode = hijack_frame({ table: 'poker:table:1', as_role: 'card_sharp', newFrame: 'street_game' });
  assert.equal(hijackNode.type, 'Curator_Sequential');
  assert.equal(hijackNode.subAgents.length, 2);
  const hijackState = (hijackNode.subAgents[0] as any).state;
  assert.equal(hijackState.tricksterAction, 'FRAME_HIJACK');

  const hyperNode = literal_gambit({ command: 'Show me all you got', extremeResult: 'Tables everything' });
  const hyperState = (hyperNode.subAgents[0] as any).state;
  assert.equal(hyperState.tricksterAction, 'MALICIOUS_HYPER_COMPLIANCE');

  const parodyNode = parody_yield({ theatrics: 'Falls to knees sobbing', as_role: 'puck' });
  const parodyState = (parodyNode.subAgents[0] as any).state;
  assert.equal(parodyState.tricksterAction, 'PARODY_YIELD');
  assert.equal(parodyState.feignedSubmission, true);

  const exposeNode = staged_expose({ exposedRole: 'hypocrite_priest', targetHypocrisy: 'Simony' });
  const exposeState = (exposeNode.subAgents[0] as any).state;
  assert.equal(exposeState.tricksterAction, 'STAGED_EXPOSE');

  const evadeNode = evade_toll({ stageTurned: true, as_role: 'diogenes' });
  const evadeState = (evadeNode.subAgents[0] as any).state;
  assert.equal(evadeState.tricksterAction, 'TOLL_EVASION');

  const ruptureNode = creative_rupture({ shatteredIllusion: 'Unmasked the oracle as a speaking tube' });
  const ruptureState = (ruptureNode.subAgents[0] as any).state;
  assert.equal(ruptureState.tricksterAction, 'CREATIVE_RUPTURE');

  const forcedNode = forced_repair({ newRule: 'Temple curtains must be transparent' });
  const forcedState = (forcedNode.subAgents[0] as any).state;
  assert.equal(forcedState.tricksterAction, 'FORCED_REPAIR');
});

test('CoffeeScript DSL Compilation: Compiling Trickster scripts to AST JSON', async () => {
  const script = `
trickster('monastery_01', 'puck')
  .feign_stance(apparentStance: 'humble_novice', innerIntent: 'undermine_dogma')
  .hijack_frame(newFrame: 'street_carnival', slapstick: true)
  .counterfeit_signal(projectedPosture: 'unarmed_monk')
  .hyper_comply(command: 'Speak only the literal truth', literalInterpretation: 'States every embarrassing private biological fact')
  .deflect_challenge(redefinition: 'I did not insult the abbot, I praised his humility in suffering')
  .parody_yield(theatrics: 'Groveling dramatically in the dust')
  .staged_expose(exposedRole: 'inquisitor', targetHypocrisy: 'Holding heretical manuscripts in private chambers')
  .refuse_ratification(dismissalReason: 'Words are but breath upon the wind')
  .evade_toll(penaltyEvaded: 'Dungeon', stageTurned: true)
  .invert_value(originalCurrency: 'Indulgences', invertedValue: 'Used toilet paper')
  .creative_rupture(shatteredIllusion: 'The monastery bells are cracked pots')
  .forced_repair(newRule: 'Silence hours replaced with comedic debate')
`;

  const ast = (await compileCoffeeScriptToAST(script)) as any;
  assert.ok(ast);
  assert.equal(ast.type, 'Curator_Sequential');
  assert.equal(ast.name, 'trickster:puck:monastery_01');
  assert.equal(ast.subAgents.length, 24); // 12 operations * 2 (setState + emitEvent)

  // Verify that all 24 subAgents alternate between Curator_SetState and Curator_EmitEvent
  const stateNodes = ast.subAgents.filter((c: any) => c.type === 'Curator_SetState');
  const emitNodes = ast.subAgents.filter((c: any) => c.type === 'Curator_EmitEvent');
  assert.equal(stateNodes.length, 12);
  assert.equal(emitNodes.length, 12);

  // Validate state actions
  assert.equal(stateNodes[0].state.tricksterAction, 'PERVERSE_STANCE');
  assert.equal(stateNodes[1].state.tricksterAction, 'FRAME_HIJACK');
  assert.equal(stateNodes[2].state.tricksterAction, 'COUNTERFEIT_SIGNAL');
  assert.equal(stateNodes[3].state.tricksterAction, 'MALICIOUS_HYPER_COMPLIANCE');
  assert.equal(stateNodes[4].state.tricksterAction, 'DEFLECT_CHALLENGE');
  assert.equal(stateNodes[5].state.tricksterAction, 'PARODY_YIELD');
  assert.equal(stateNodes[6].state.tricksterAction, 'STAGED_EXPOSE');
  assert.equal(stateNodes[7].state.tricksterAction, 'REFUSE_RATIFICATION');
  assert.equal(stateNodes[8].state.tricksterAction, 'TOLL_EVASION');
  assert.equal(stateNodes[9].state.tricksterAction, 'VALUE_INVERSION');
  assert.equal(stateNodes[10].state.tricksterAction, 'CREATIVE_RUPTURE');
  assert.equal(stateNodes[11].state.tricksterAction, 'FORCED_REPAIR');
});

