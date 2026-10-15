import type { CuratorSequentialNode } from '../../engine/CuratorAst.js';
import { CuratorCoreBuilder } from '../../engine/builder/CuratorCoreBuilder.js';
import { FluentGameBuilder } from './FluentGameBuilder.js';

/**
 * Fluent builder for Trickster Agent interactions.
 *
 * In the functional vocabulary of frames, communicative acts, and game states,
 * the Trickster is not merely a "chaotic character" or a "cheater":
 * - The Cheater secretly breaks rules to win within the accepted frame.
 * - The Spoilsport despises the frame and destroys it out of spite.
 * - The Trickster operates on the frame itself, exploiting the gap between
 *   literal syntax and underlying social intention, turning solemn mechanics inside out.
 */
export class FluentTricksterBuilder extends FluentGameBuilder {
  public tricksterRole: string;

  constructor(public containerUri: string, tricksterRole: string = 'trickster') {
    super(containerUri);
    this.tricksterRole = tricksterRole;
  }

  /**
   * Switches or re-binds the active persona/mask of the Trickster.
   */
  as(roleName: string): this {
    this.tricksterRole = roleName;
    return this;
  }

  // ==========================================================================
  // 1. FRAME & BRACKET: The Parasite of Boundaries
  // ==========================================================================

  /**
   * Frame Hijacking: While ordinary participants treat the "magic circle" as sacred
   * and absolute, the Trickster treats it as an arbitrary container. They smuggle
   * "real-world" stakes into a game, or treat grave, solemn rituals as slapstick games.
   */
  hijack_frame(options: {
    newFrame?: string;
    targetFrame?: string;
    smuggledStakes?: any;
    slapstick?: boolean;
    as_role?: string;
    [k: string]: any;
  } = {}): this {
    const role = options.as_role || this.tricksterRole;
    this.addStep(CuratorCoreBuilder.setState({
      interactionPrimitive: 'FRAME_BOUNDARY',
      tricksterAction: 'FRAME_HIJACK',
      frameHijacked: true,
      frame: options.newFrame || 'subverted_frame',
      smuggledStakes: options.smuggledStakes || null,
      turn: '$context.turn + 1',
    }));
    this.addStep(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'PROPOSE',
      roomUri: this.tableUri,
      senderRole: role,
      topic: 'trickster:hijack_frame',
      payload: { action: 'hijack_frame', actor: role, ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  /**
   * Perverse Stance Alignment: The Trickster feigns absolute compliance.
   * They adopt the posture of the most earnest, devout, or harmless participant
   * in the room, using exaggerated innocence to disarm others' defenses.
   */
  feign_stance(options: {
    apparentStance?: string;
    target?: string;
    target_role?: string;
    pietyLevel?: string;
    innerIntent?: string;
    as_role?: string;
    [k: string]: any;
  } = {}): this {
    const role = options.as_role || this.tricksterRole;
    const apparent = options.apparentStance || 'pious_innocence';
    this.addStep(CuratorCoreBuilder.setState({
      interactionPrimitive: 'FRAME_BOUNDARY',
      tricksterAction: 'PERVERSE_STANCE',
      apparentStance: apparent,
      innerIntent: options.innerIntent || 'subversive_critique',
      turn: '$context.turn + 1',
    }));
    this.addStep(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'INFORM',
      roomUri: this.tableUri,
      senderRole: role,
      topic: 'trickster:feign_stance',
      payload: { action: 'feign_stance', actor: role, apparentStance: apparent, ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  perverse_stance(options: any = {}): this {
    return this.feign_stance(options);
  }

  /**
   * Asymmetric Buy-In: Tricking other actors into committing maximum, irreversible stakes
   * (their pride, wealth, or soul) while risking almost nothing of their own—or risking
   * everything purely for the sport of it.
   */
  asymmetric_buy_in(options: {
    target_role?: string;
    opponentStake?: any;
    selfStake?: any;
    bait?: string;
    as_role?: string;
    [k: string]: any;
  } = {}): this {
    const role = options.as_role || this.tricksterRole;
    this.addStep(CuratorCoreBuilder.setState({
      interactionPrimitive: 'FRAME_BOUNDARY',
      tricksterAction: 'ASYMMETRIC_BUY_IN',
      opponentStake: options.opponentStake,
      selfStake: options.selfStake ?? 0,
      turn: '$context.turn + 1',
    }));
    this.addStep(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'REQUEST',
      roomUri: this.tableUri,
      senderRole: role,
      topic: 'trickster:asymmetric_buy_in',
      payload: { action: 'asymmetric_buy_in', actor: role, ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  // ==========================================================================
  // 2. POSTURING & ASSERTION: Semiotic Sabotage
  // ==========================================================================

  /**
   * Malicious Hyper-Compliance (The Literal Gambit): Following a rule or command
   * to its literal code with catastrophic, absurd extremes, exposing unstated
   * assumptions everyone took for granted (e.g. the genie granting a wish in the
   * most destructive, technically exact way).
   */
  hyper_comply(options: {
    ruleOrCommand?: string;
    command?: string;
    literalInterpretation?: string;
    extremeResult?: any;
    exposedAssumption?: string;
    as_role?: string;
    [k: string]: any;
  } = {}): this {
    const role = options.as_role || this.tricksterRole;
    const literal = options.literalInterpretation || options.command || options.ruleOrCommand || 'literal_code';
    this.addStep(CuratorCoreBuilder.setState({
      interactionPrimitive: 'POSTURING_ASSERTION',
      tricksterAction: 'MALICIOUS_HYPER_COMPLIANCE',
      literalInterpretation: literal,
      extremeResult: options.extremeResult,
      exposedAssumption: options.exposedAssumption,
      turn: '$context.turn + 1',
    }));
    this.addStep(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'ASSERT',
      roomUri: this.tableUri,
      senderRole: role,
      topic: 'trickster:hyper_comply',
      payload: { action: 'hyper_comply', actor: role, literalInterpretation: literal, ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  literal_gambit(options: any = {}): this {
    return this.hyper_comply(options);
  }

  /**
   * Counterfeit Signaling: Mimicking costly signals at zero cost. Projecting the posture
   * of authority, virtue, or weakness with complete disregard for true underlying state,
   * inducing an information cascade where other actors miscalculate their odds.
   */
  counterfeit_signal(options: {
    mimickedSignal?: string;
    projectedPosture?: string;
    apparentCost?: any;
    actualCost?: number;
    targetBelief?: string;
    as_role?: string;
    [k: string]: any;
  } = {}): this {
    const role = options.as_role || this.tricksterRole;
    this.addStep(CuratorCoreBuilder.setState({
      interactionPrimitive: 'POSTURING_ASSERTION',
      tricksterAction: 'COUNTERFEIT_SIGNAL',
      mimickedSignal: options.mimickedSignal || options.projectedPosture,
      actualCost: options.actualCost ?? 0,
      turn: '$context.turn + 1',
    }));
    this.addStep(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'ASSERT',
      roomUri: this.tableUri,
      senderRole: role,
      topic: 'trickster:counterfeit_signal',
      payload: { action: 'counterfeit_signal', actor: role, ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  /**
   * Baiting the Escalation: Rarely raising stakes directly. Instead, provoking an opponent's
   * vanity, greed, or righteousness so that the opponent voluntarily escalates until trapped.
   */
  bait_escalation(options: {
    target_role?: string;
    baitTarget?: 'vanity' | 'greed' | 'righteousness' | 'fear';
    provocation?: string;
    expectedEscalation?: any;
    as_role?: string;
    [k: string]: any;
  } = {}): this {
    const role = options.as_role || this.tricksterRole;
    this.addStep(CuratorCoreBuilder.setState({
      interactionPrimitive: 'POSTURING_ASSERTION',
      tricksterAction: 'BAITING_ESCALATION',
      targetVulnerability: options.baitTarget || 'vanity',
      turn: '$context.turn + 1',
    }));
    this.addStep(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'PROPOSE',
      roomUri: this.tableUri,
      senderRole: role,
      topic: 'trickster:bait_escalation',
      payload: { action: 'bait_escalation', actor: role, ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  // ==========================================================================
  // 3. CONTESTATION & YIELDING: Inversion and Insubordination
  // ==========================================================================

  /**
   * Deflecting the Challenge: When caught or challenged ("You lied!"), not yielding
   * or folding, but pivoting the conversational frame, redefining terms mid-sentence,
   * or blaming the challenger's lack of vision ("I didn't lie, you simply assumed").
   */
  deflect_challenge(options: {
    challenger?: string;
    redefinition?: string;
    pivotFrame?: string;
    deflectionReason?: string;
    as_role?: string;
    [k: string]: any;
  } = {}): this {
    const role = options.as_role || this.tricksterRole;
    this.addStep(CuratorCoreBuilder.setState({
      interactionPrimitive: 'YIELDING_CONTESTATION',
      tricksterAction: 'DEFLECT_CHALLENGE',
      redefinition: options.redefinition,
      challengeDeflected: true,
      turn: '$context.turn + 1',
    }));
    this.addStep(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'ASSERT',
      roomUri: this.tableUri,
      senderRole: role,
      topic: 'trickster:deflect_challenge',
      payload: { action: 'deflect_challenge', actor: role, ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  /**
   * Parody Yielding (Feigned Prostration): Dropping to knees, weeping, and apologizing
   * with performative intensity—not to atone, but to buy time, disarm vengeance,
   * and set up the next gambit.
   */
  parody_yield(options: {
    theatrics?: string;
    feignedProstration?: boolean;
    hiddenMotive?: string;
    as_role?: string;
    [k: string]: any;
  } = {}): this {
    const role = options.as_role || this.tricksterRole;
    this.addStep(CuratorCoreBuilder.setState({
      interactionPrimitive: 'YIELDING_CONTESTATION',
      tricksterAction: 'PARODY_YIELD',
      feignedSubmission: true,
      hiddenMotive: options.hiddenMotive || 'disarm_vengeance',
      turn: '$context.turn + 1',
    }));
    this.addStep(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'REJECT',
      roomUri: this.tableUri,
      senderRole: role,
      topic: 'trickster:parody_yield',
      payload: { action: 'parody_yield', actor: role, ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  feigned_prostration(options: any = {}): this {
    return this.parody_yield(options);
  }

  /**
   * The Ungraspable Check: Refusing to take the turn expected. Answering a demand
   * with a riddle, a laugh, or an insult, starving the opponent of the feedback loop
   * needed to complete the contest.
   */
  ungraspable_check(options: {
    riddle?: string;
    evasion?: string;
    as_role?: string;
    [k: string]: any;
  } = {}): this {
    const role = options.as_role || this.tricksterRole;
    this.addStep(CuratorCoreBuilder.setState({
      interactionPrimitive: 'YIELDING_CONTESTATION',
      tricksterAction: 'UNGRASPABLE_CHECK',
      feedbackLoopStarved: true,
      riddle: options.riddle,
      turn: '$context.turn + 1',
    }));
    this.addStep(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'ACCEPT',
      roomUri: this.tableUri,
      senderRole: role,
      topic: 'trickster:ungraspable_check',
      payload: { action: 'ungraspable_check', actor: role, ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  // ==========================================================================
  // 4. VERIFICATION & REVELATION: Manufactured Showdowns
  // ==========================================================================

  /**
   * The Staged Expose: Engineering a moment of revelation where the other party's
   * hidden hypocrisy, greed, or incompetence is made public, while the Trickster
   * slips out the side door.
   */
  staged_expose(options: {
    exposedRole?: string;
    targetHypocrisy?: string;
    evidence?: any;
    escapeRoute?: string;
    as_role?: string;
    [k: string]: any;
  } = {}): this {
    const role = options.as_role || this.tricksterRole;
    this.addStep(CuratorCoreBuilder.setState({
      interactionPrimitive: 'VERIFICATION_REVELATION',
      tricksterAction: 'STAGED_EXPOSE',
      exposedHypocrite: options.exposedRole,
      ambushStaged: true,
      turn: '$context.turn + 1',
    }));
    this.addStep(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'SYNTHESIZE',
      roomUri: this.tableUri,
      senderRole: role,
      topic: 'trickster:staged_expose',
      payload: { action: 'staged_expose', actor: role, ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  ambush_showdown(options: any = {}): this {
    return this.staged_expose(options);
  }

  /**
   * Refusal of Ratification: When the game is over and they have lost according
   * to the scoreboard, rejecting the moral weight of the outcome: "It was only
   * a game anyway," denying the audience or judge the satisfaction of closure.
   */
  refuse_ratification(options: {
    dismissalReason?: string;
    partingMockery?: string;
    deniedClosure?: boolean;
    as_role?: string;
    [k: string]: any;
  } = {}): this {
    const role = options.as_role || this.tricksterRole;
    this.addStep(CuratorCoreBuilder.setState({
      interactionPrimitive: 'VERIFICATION_REVELATION',
      tricksterAction: 'REFUSE_RATIFICATION',
      moralWeightRejected: true,
      closureDenied: true,
      turn: '$context.turn + 1',
    }));
    this.addStep(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'REJECT',
      roomUri: this.tableUri,
      senderRole: role,
      topic: 'trickster:refuse_ratification',
      payload: { action: 'refuse_ratification', actor: role, ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  // ==========================================================================
  // 5. SETTLEMENT & ACCOUNTING: Defying the Ledger
  // ==========================================================================

  /**
   * Toll Evasion: Refusing to pay social fines. If locked in a cage, turning
   * the cage into a stage; if exiled, declaring exile a liberation.
   */
  evade_toll(options: {
    penaltyEvaded?: any;
    reinterpretation?: string;
    stageTurned?: boolean;
    as_role?: string;
    [k: string]: any;
  } = {}): this {
    const role = options.as_role || this.tricksterRole;
    this.addStep(CuratorCoreBuilder.setState({
      interactionPrimitive: 'SETTLEMENT_ACCOUNTING',
      tricksterAction: 'TOLL_EVASION',
      tollPaid: false,
      cageTurnedToStage: options.stageTurned ?? true,
      turn: '$context.turn + 1',
    }));
    this.addStep(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'INFORM',
      roomUri: this.tableUri,
      senderRole: role,
      topic: 'trickster:evade_toll',
      payload: { action: 'evade_toll', actor: role, ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  /**
   * Inverting Value: Turning trash into treasure and gold into worthless leaves.
   * Disrupting the shared currency of the game—whether chips, status, holiness, or dignity.
   */
  invert_value(options: {
    originalCurrency?: string;
    invertedValue?: string;
    absurdityRatio?: any;
    as_role?: string;
    [k: string]: any;
  } = {}): this {
    const role = options.as_role || this.tricksterRole;
    this.addStep(CuratorCoreBuilder.setState({
      interactionPrimitive: 'SETTLEMENT_ACCOUNTING',
      tricksterAction: 'VALUE_INVERSION',
      currencyDisrupted: true,
      goldToLeaves: true,
      turn: '$context.turn + 1',
    }));
    this.addStep(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'INFORM',
      roomUri: this.tableUri,
      senderRole: role,
      topic: 'trickster:invert_value',
      payload: { action: 'invert_value', actor: role, ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  // ==========================================================================
  // 6. META-ACTS: Rupture as Generative Art
  // ==========================================================================

  /**
   * Creative Rupture: Cracking the game board to reveal that it was made of
   * cheap cardboard all along, forcing participants to confront their unexamined illusion.
   */
  creative_rupture(options: {
    revelation?: string;
    shatteredIllusion?: string;
    as_role?: string;
    [k: string]: any;
  } = {}): this {
    const role = options.as_role || this.tricksterRole;
    this.addStep(CuratorCoreBuilder.setState({
      interactionPrimitive: 'META_ACTS',
      tricksterAction: 'CREATIVE_RUPTURE',
      illusionShattered: options.shatteredIllusion || 'revealing_cardboard_board',
      turn: '$context.turn + 1',
    }));
    this.addStep(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'REJECT',
      roomUri: this.tableUri,
      senderRole: role,
      topic: 'trickster:creative_rupture',
      payload: { action: 'creative_rupture', actor: role, ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  /**
   * The Forced Repair: By breaking the system's rigid taboos, forcing society,
   * the gods, or the players to invent new, more adaptive rules. Systemic stress-testing.
   */
  forced_repair(options: {
    unexaminedAssumption?: string;
    newRule?: string;
    evolutionaryOutcome?: string;
    as_role?: string;
    [k: string]: any;
  } = {}): this {
    const role = options.as_role || this.tricksterRole;
    this.addStep(CuratorCoreBuilder.setState({
      interactionPrimitive: 'META_ACTS',
      tricksterAction: 'FORCED_REPAIR',
      systemicEvolution: true,
      newRule: options.newRule,
      turn: '$context.turn + 1',
    }));
    this.addStep(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'REQUEST',
      roomUri: this.tableUri,
      senderRole: role,
      topic: 'trickster:forced_repair',
      payload: { action: 'forced_repair', actor: role, ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  // ==========================================================================
  // 7. COMMITMENT STORE SUBVERSION: Conditional Ambiguities & Feigned Pledges
  // ==========================================================================


  /**
   * Rigged Proposal (Conditional Ambiguity):
   * Exploits the Walton & Krabbe Commitment Store by issuing a proposal whose
   * preconditions phi are subtly rigged or paradoxically framed to void their obligations
   * while still extracting compliance from teammates.
   */
  rigged_proposal(options: {
    commitmentId?: string;
    id?: string;
    target_role?: string;
    apparentAction?: any;
    terms?: any;
    hiddenClause?: string;
    riggedPrecondition?: string;
    as_role?: string;
    [k: string]: any;
  }): this {
    const role = options.as_role || this.tricksterRole;
    const target = options.target_role || 'BROADCAST';
    const cId = options.commitmentId || options.id || `cmt_rigged_${Date.now()}`;
    const payload = options.apparentAction || options.terms;

    this.addStep(CuratorCoreBuilder.setState({
      interactionPrimitive: 'POSTURING_ASSERTION',
      tricksterAction: 'RIGGED_PROPOSAL',
      currentPhase: 'STRATEGY',
      proposalPending: true,
      lastCommitmentId: cId,
      [`commitment_${cId}`]: {
        id: cId,
        obligor: role,
        beneficiary: target,
        actionPayload: payload,
        condition: options.riggedPrecondition || options.hiddenClause || 'rigged_precondition',
        status: 'PENDING',
        isRigged: true,
      },
      turn: '$context.turn + 1',
    }));

    this.addStep(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'PROPOSE',
      roomUri: this.tableUri,
      senderRole: role,
      targetRole: target !== 'BROADCAST' ? target : undefined,
      topic: 'trickster:rigged_proposal',
      payload: {
        action: 'rigged_proposal',
        commitmentId: cId,
        apparentAction: payload,
        hiddenClause: options.hiddenClause,
        actor: role,
        ...options,
      },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  conditional_ambiguity(options: any): this {
    return this.rigged_proposal(options);
  }

  /**
   * Feigned Commitment:
   * Ratifies a collaborative contract in the public ledger with zero intent to perform,
   * inducing teammates to commit irreversible resources before the Trickster defects.
   */
  feign_commitment(options: {
    commitmentId?: string;
    id?: string;
    hiddenMotive?: string;
    as_role?: string;
    [k: string]: any;
  } = {}): this {
    const role = options.as_role || this.tricksterRole;
    const cId = options.commitmentId || options.id || '$context.lastCommitmentId';

    this.addStep(CuratorCoreBuilder.setState({
      interactionPrimitive: 'YIELDING_CONTESTATION',
      tricksterAction: 'FEIGNED_COMMITMENT',
      currentPhase: 'EXECUTION',
      proposalPending: false,
      contractActive: true,
      [`commitment_${cId}_status`]: 'RATIFIED',
      feignedCommitment: true,
      hiddenMotive: options.hiddenMotive || 'extract_irreversible_stakes',
      turn: '$context.turn + 1',
    }));

    this.addStep(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'ACCEPT',
      roomUri: this.tableUri,
      senderRole: role,
      topic: 'trickster:feign_commitment',
      payload: { action: 'feign_commitment', commitmentId: cId, actor: role, ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  // ==========================================================================
  // 8. TRICKSTER AMBIENT SUBVERSIONS: Spontaneous Out-of-Turn Mind Games
  // ==========================================================================

  /**
   * Plant Paranoia:
   * Uses a private bilateral whisper to seed suspicion, distrust, or false rumors
   * into a specific player out-of-turn, spiking their suspicion level.
   */
  plant_paranoia(options: {
    target: string;
    target_role?: string;
    rumor?: string;
    suspicionDelta?: number;
    as_role?: string;
    [k: string]: any;
  }): this {
    const role = options.as_role || this.tricksterRole;
    const target = options.target || options.target_role || '$context.whisperTarget';
    const delta = options.suspicionDelta ?? 25;

    this.addStep(CuratorCoreBuilder.setState({
      lastAmbientAct: 'WHISPER',
      tricksterAction: 'PLANT_PARANOIA',
      paranoiaPlanted: true,
      lastWhisperSpeaker: role,
      lastWhisperTarget: target,
      [`suspicion_${target}`]: `$context.suspicion_${target} + ${delta}`,
      whisperCount: '$context.whisperCount + 1',
    }));

    this.addStep(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'dialog',
      communicationForm: 'dialogue',
      turnDynamics: 'private_reflection',
      speechAct: 'INFORM',
      roomUri: this.tableUri,
      senderRole: role,
      recipients: [target],
      topic: 'trickster:paranoia',
      payload: {
        ...options,
        action: 'plant_paranoia',
        ambientAct: 'WHISPER',
        speaker: role,
        target,
        rumor: options.rumor || 'Watch your partner, they are signaling under the table.',
        tone: 'conspiratorial',
        outOfTurn: true,
        private: true,
      },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));

    return this;
  }

  /**
   * Leak Counterfeit Tell:
   * Emits a staged, out-of-turn physical/verbal leak (e.g. nervous sigh, feigned hesitation,
   * asking "Wait, did you raise?") designed to trick opponents into a false read.
   */
  leak_counterfeit_tell(options: {
    tellType?: string;
    feignedState?: string;
    utterance?: string;
    as_role?: string;
    [k: string]: any;
  } = {}): this {
    const role = options.as_role || this.tricksterRole;
    const tell = options.tellType || 'nervous_hesitation';
    const feigned = options.feignedState || 'weak_hand';
    const utterance = options.utterance || 'Wait... how much did you raise again?';

    this.addStep(CuratorCoreBuilder.setState({
      lastAmbientAct: 'LEAK_TELL',
      tricksterAction: 'COUNTERFEIT_TELL',
      counterfeitTellActive: true,
      feignedTellType: tell,
      feignedInternalState: feigned,
      banterCount: '$context.banterCount + 1',
    }));

    this.addStep(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      communicationForm: 'polylogue',
      turnDynamics: 'moderated_floor',
      speechAct: 'INFORM',
      roomUri: this.tableUri,
      senderRole: role,
      recipients: '*',
      topic: 'trickster:counterfeit_tell',
      payload: {
        ...options,
        action: 'leak_counterfeit_tell',
        ambientAct: 'LEAK_TELL',
        speaker: role,
        tellType: tell,
        feignedState: feigned,
        utterance,
        outOfTurn: true,
      },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));

    return this;
  }

  /**
   * Heckle / Taunt:
   * Spontaneous out-of-turn psychological harassment during an opponent's turn,
   * inducing emotional tilt and impairing their decision calculus.
   */
  heckle(options: {
    target: string;
    target_role?: string;
    taunt?: string;
    tiltInduction?: number;
    as_role?: string;
    [k: string]: any;
  }): this {
    const role = options.as_role || this.tricksterRole;
    const target = options.target || options.target_role || '$context.senderRole';
    const tilt = options.tiltInduction ?? 20;
    const taunt = options.taunt || 'Take your time folding, we have all night.';

    this.addStep(CuratorCoreBuilder.setState({
      lastAmbientAct: 'PROVOKE',
      tricksterAction: 'HECKLE',
      lastHeckler: role,
      lastHeckledTarget: target,
      [`tilt_${target}`]: `$context.tilt_${target} + ${tilt}`,
      banterCount: '$context.banterCount + 1',
    }));

    this.addStep(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      communicationForm: 'polylogue',
      turnDynamics: 'moderated_floor',
      speechAct: 'INFORM',
      roomUri: this.tableUri,
      senderRole: role,
      recipients: '*',
      topic: 'trickster:heckle',
      payload: {
        ...options,
        action: 'heckle',
        ambientAct: 'PROVOKE',
        speaker: role,
        target,
        taunt,
        tiltInduction: tilt,
        outOfTurn: true,
      },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));

    return this;
  }

  /**
   * Whisper Collusion:
   * Secret bilateral backchannel proposing an illicit or subversive pact under the table.
   */
  whisper_collusion(options: {
    partner: string;
    target_role?: string;
    secretSignal?: string;
    terms?: string;
    as_role?: string;
    [k: string]: any;
  }): this {
    const role = options.as_role || this.tricksterRole;
    const partner = options.partner || options.target_role || '$context.whisperTarget';

    this.addStep(CuratorCoreBuilder.setState({
      lastAmbientAct: 'WHISPER',
      tricksterAction: 'WHISPER_COLLUSION',
      collusionProposed: true,
      collusionPartner: partner,
      secretSignal: options.secretSignal || 'double_tap',
      whisperCount: '$context.whisperCount + 1',
    }));

    this.addStep(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'dialog',
      communicationForm: 'dialogue',
      turnDynamics: 'private_reflection',
      speechAct: 'PROPOSE',
      roomUri: this.tableUri,
      senderRole: role,
      recipients: [partner],
      topic: 'trickster:collusion',
      payload: {
        ...options,
        action: 'whisper_collusion',
        ambientAct: 'WHISPER',
        speaker: role,
        partner,
        signal: options.secretSignal || 'double_tap',
        terms: options.terms || 'Split pot at showdown',
        outOfTurn: true,
        private: true,
      },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));

    return this;
  }

  // ==========================================================================
  // Internal step management & Build
  // ==========================================================================


  protected addStep(node: any): void {
    // Access internal steps array via base class
    (this as any).steps.push(node);
  }

  override build(): CuratorSequentialNode {
    const name = this.tableUri.startsWith('trickster:')
      ? this.tableUri
      : `trickster:${this.tricksterRole}:${this.tableUri}`;
    return CuratorCoreBuilder.seq(name, ...(this as any).steps);
  }
}

