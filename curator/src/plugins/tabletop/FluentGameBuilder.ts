import type { CuratorAstNode, CuratorSequentialNode } from '../../engine/CuratorAst.js';
import { CuratorCoreBuilder } from '../../engine/builder/CuratorCoreBuilder.js';
import {
  UNIVERSAL_GAME_PHASE_MATRIX,
  UNIVERSAL_INTERACTION_MATRIX,
  type UniversalInteractionPrimitive,
  type AmbientSpeechActOptions,
  type AmbientSpeechActType,
} from './matrix.js';

/**
 * Universal Interaction Order & Game State Machine Fluent Builder.
 * Unifies games, speech acts, rituals, political theater, and everyday habits
 * across the 6 foundational primitives:
 *
 * 1. Frame & Boundary (The Container: Bracket, Stance, Stake/Buy-In)
 * 2. Posturing & Assertion (Claiming Reality: Bid/Gambit, Posture/Signal, Raise/Escalation)
 * 3. Yielding & Contestation (Managing Collision: Check/Deferral, Challenge/Interrogation, Yield/Concession)
 * 4. Verification & Revelation (Collapsing Entropy: Expose/Showdown, Ratification/Witnessing)
 * 5. Settlement & Accounting (State Rebalance: Levy/Toll, Clear/Reset)
 * 6. Meta-Acts (Rules of the Rule-Set: Repair, Rupture)
 */
export class FluentGameBuilder {
  protected steps: CuratorAstNode[] = [];

  constructor(public tableUri: string) {}

  // ==========================================================================
  // 1. FRAME & BOUNDARY (The Container)
  // ==========================================================================

  /**
   * Bracket (or Magic Circle): The temporal and spatial boundary that isolates
   * the interaction from "real life." Activates a distinct operational ruleset.
   * Analogs: Shuffling & dealing | Clearing throat, "Can we talk?" | Crossing threshold, ringing a bell | Gavel strike
   */
  bracket(options: {
    container?: string;
    frame?: string;
    ruleset?: string;
    duration?: string | number;
    [k: string]: any;
  } = {}): this {
    const meta = UNIVERSAL_INTERACTION_MATRIX.FRAME_BOUNDARY;
    const targetContainer = options.container || this.tableUri;

    this.steps.push(CuratorCoreBuilder.setState({
      interactionPrimitive: meta.primitive,
      interactionPhase: 'BRACKET',
      magicCircle: true,
      frame: options.frame || 'magic_circle',
      ruleset: options.ruleset || 'default',
      containerUri: targetContainer,
      turn: '$context.turn + 1',
    }));

    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'REQUEST',
      roomUri: this.tableUri,
      topic: 'interaction:bracket',
      payload: { action: 'bracket', container: targetContainer, ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  magic_circle(options: any = {}): this {
    return this.bracket(options);
  }

  /**
   * Stance / Frame Alignment: The explicit or implicit declaration of how a participant
   * views the current reality—e.g., playful, adversarial, solemn, transactional, sacred.
   */
  stance(
    alignmentOrOptions: string | { alignment: string; as_role?: string; [k: string]: any },
    options: { as_role?: string; [k: string]: any } = {}
  ): this {
    const meta = UNIVERSAL_INTERACTION_MATRIX.FRAME_BOUNDARY;
    const alignment = typeof alignmentOrOptions === 'string'
      ? alignmentOrOptions
      : (alignmentOrOptions.alignment || 'transactional');
    const extra = typeof alignmentOrOptions === 'object' ? alignmentOrOptions : options;
    const senderRole = extra.as_role || options.as_role || '$context.senderRole';

    this.steps.push(CuratorCoreBuilder.setState({
      interactionPrimitive: meta.primitive,
      interactionPhase: 'STANCE',
      stance: alignment,
      frameAlignment: alignment,
      turn: '$context.turn + 1',
    }));

    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'INFORM',
      roomUri: this.tableUri,
      senderRole,
      topic: 'interaction:stance',
      payload: { action: 'stance', alignment, ...extra },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  frame_alignment(alignmentOrOptions: any, options: any = {}): this {
    return this.stance(alignmentOrOptions, options);
  }

  /**
   * Stake / Buy-In: The material, social, or emotional collateral committed
   * to legitimize participation.
   * Analogs: Posting blinds / ante | Credibility / vulnerability | Personal vow / submission | Bail
   */
  stake(options: {
    amount?: number;
    collateralType?: 'material' | 'social_face' | 'emotional_vulnerability' | 'sacred_pledge';
    collateral?: any;
    blinds?: Record<string, number>;
    pot?: number;
    as_role?: string;
    [k: string]: any;
  } = {}): this {
    const meta = UNIVERSAL_INTERACTION_MATRIX.FRAME_BOUNDARY;
    const collType = options.collateralType || 'material';
    const amountVal = options.amount ?? options.pot ?? 0;

    this.steps.push(CuratorCoreBuilder.setState({
      interactionPrimitive: meta.primitive,
      interactionPhase: 'STAKE',
      gamePhase: 'ANTE',
      universalPhase: 'INITIALIZATION',
      turn: '$context.turn + 1',
      stake: amountVal || options.collateral || 0,
      collateralType: collType,
      pot: amountVal,
      blinds: options.blinds || null,
    }));

    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'REQUEST',
      roomUri: this.tableUri,
      senderRole: options.as_role || '$context.senderRole',
      topic: 'interaction:stake',
      payload: { action: 'stake', collateralType: collType, ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  buy_in(options: any = {}): this {
    return this.stake(options);
  }

  /**
   * Phase 1 (Legacy Tabletop Ante): Commits baseline stakes or posts blinds.
   */
  ante(options: { amount?: number; pot?: number; blinds?: Record<string, number>; [k: string]: any } = {}): this {
    const meta = UNIVERSAL_GAME_PHASE_MATRIX.INITIALIZATION;
    this.steps.push(CuratorCoreBuilder.setState({
      gamePhase: 'ANTE',
      universalPhase: meta.phase,
      fundamentalQuestion: meta.fundamentalQuestion,
      playerAgency: meta.playerAgency,
      turn: '$context.turn + 1',
      pot: options.pot || options.amount || 0,
      blinds: options.blinds || null,
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'REQUEST',
      roomUri: this.tableUri,
      topic: 'game:ante',
      payload: { action: 'ante', ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  // ==========================================================================
  // 2. POSTURING & ASSERTION (Claiming Reality)
  // ==========================================================================

  /**
   * Bid / Gambit: An opening communicative move that proposes a trajectory
   * or seeks to alter the status quo. It demands a response from others.
   * Analogs: Placing lead card / trump bid | Leading question | Opening prayer / greeting | Opening motion
   */
  bid(options: { as_role?: string; suit?: string; tricks?: number; amount?: number; gambit?: string; [k: string]: any } = {}): this {
    const meta = UNIVERSAL_INTERACTION_MATRIX.POSTURING_ASSERTION;
    this.steps.push(CuratorCoreBuilder.setState({
      interactionPrimitive: meta.primitive,
      gamePhase: 'CONTRACTING',
      universalPhase: 'INITIALIZATION',
      turn: '$context.turn + 1',
      lastBid: options,
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'PROPOSE',
      roomUri: this.tableUri,
      senderRole: options.as_role || '$context.senderRole',
      topic: 'game:bid',
      payload: { action: 'bid', ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  gambit(options: { as_role?: string; move?: string; trajectory?: string; proposal?: any; [k: string]: any } = {}): this {
    const meta = UNIVERSAL_INTERACTION_MATRIX.POSTURING_ASSERTION;
    this.steps.push(CuratorCoreBuilder.setState({
      interactionPrimitive: meta.primitive,
      interactionAct: 'gambit',
      turn: '$context.turn + 1',
      lastGambit: options,
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'PROPOSE',
      roomUri: this.tableUri,
      senderRole: options.as_role || '$context.senderRole',
      topic: 'interaction:gambit',
      payload: { action: 'gambit', ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  /**
   * Posture / Signal: A move that communicates private information, confidence,
   * or authority—either truthfully (costly signaling) or deceitfully (bluffing, feigning piety, frontstage).
   * Analogs: Bluffing a big bet | Tone of authority / expertise | Austere silence / bowed head | Press conference
   */
  posture(options: {
    as_role?: string;
    signalType?: 'costly' | 'cheap_talk' | 'bluff';
    claim?: string;
    declaration?: string;
    authority?: string;
    rank?: string;
    count?: number;
    cards?: any;
    [k: string]: any;
  }): this {
    const meta = UNIVERSAL_INTERACTION_MATRIX.POSTURING_ASSERTION;
    this.steps.push(CuratorCoreBuilder.setState({
      interactionPrimitive: meta.primitive,
      gamePhase: 'POSTURING',
      universalPhase: 'INTERACTION',
      turn: '$context.turn + 1',
      lastPosture: options,
      lastClaim: options,
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'ASSERT',
      roomUri: this.tableUri,
      senderRole: options.as_role || '$context.senderRole',
      topic: 'interaction:posture',
      payload: { action: 'posture', ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  signal(options: any): this {
    return this.posture(options);
  }

  claim(options: { as_role?: string; declaration: string; rank?: string; count?: number; cards?: any; [k: string]: any }): this {
    const meta = UNIVERSAL_GAME_PHASE_MATRIX.INTERACTION;
    this.steps.push(CuratorCoreBuilder.setState({
      gamePhase: 'POSTURING',
      universalPhase: meta.phase,
      fundamentalQuestion: meta.fundamentalQuestion,
      playerAgency: meta.playerAgency,
      microTurn: 'CLAIM',
      turn: '$context.turn + 1',
      lastClaim: options,
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'ASSERT',
      roomUri: this.tableUri,
      senderRole: options.as_role || '$context.senderRole',
      topic: 'game:claim',
      payload: { action: 'claim', ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  /**
   * Raise / Escalation: Increasing the stakes or conversational friction to test
   * an opponent's resolve, force exposure, or accelerate the ritual pace.
   */
  raise(options: { as_role?: string; amount?: number; friction?: string; [k: string]: any } = {}): this {
    const meta = UNIVERSAL_INTERACTION_MATRIX.POSTURING_ASSERTION;
    const amountVal = options.amount || 0;
    this.steps.push(CuratorCoreBuilder.setState({
      interactionPrimitive: meta.primitive,
      gamePhase: 'WAGER',
      microTurn: 'VALUATION',
      turn: '$context.turn + 1',
      currentWager: amountVal,
      pot: amountVal ? `$context.pot + ${amountVal}` : '$context.pot',
      lastEscalation: options,
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'PROPOSE',
      roomUri: this.tableUri,
      senderRole: options.as_role || '$context.senderRole',
      topic: 'wager:raise',
      payload: { action: 'raise', amount: amountVal, ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  escalate(options: any = {}): this {
    return this.raise(options);
  }

  wager(options: { action?: 'bet' | 'raise' | 'check'; amount?: number; as_role?: string; [k: string]: any } = {}): this {
    const act = options.action || 'bet';
    const meta = UNIVERSAL_GAME_PHASE_MATRIX.INTERACTION;
    this.steps.push(CuratorCoreBuilder.setState({
      gamePhase: 'WAGER',
      universalPhase: meta.phase,
      fundamentalQuestion: meta.fundamentalQuestion,
      playerAgency: meta.playerAgency,
      microTurn: 'VALUATION',
      turn: '$context.turn + 1',
      currentWager: options.amount || 0,
      pot: `$context.pot + ${options.amount || 0}`,
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'PROPOSE',
      roomUri: this.tableUri,
      senderRole: options.as_role || '$context.senderRole',
      topic: `wager:${act}`,
      payload: { action: act, amount: options.amount, ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  // ==========================================================================
  // TABLETOP SPECIFIC ALLOCATION & PLAY CYCLE (Information Partitioning)
  // ==========================================================================

  deal(options: { privateCount?: number; communityCount?: number; holeCards?: number; community?: number; [k: string]: any } = {}): this {
    const privCount = options.privateCount ?? options.holeCards ?? 0;
    const commCount = options.communityCount ?? options.community ?? 0;
    const meta = UNIVERSAL_GAME_PHASE_MATRIX.ALLOCATION;

    this.steps.push(CuratorCoreBuilder.setState({
      gamePhase: 'DEAL',
      universalPhase: meta.phase,
      fundamentalQuestion: meta.fundamentalQuestion,
      playerAgency: meta.playerAgency,
      turn: '$context.turn + 1',
      privateCardCount: privCount,
      communityCardCount: commCount,
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'INFORM',
      roomUri: this.tableUri,
      topic: 'game:deal',
      payload: { action: 'deal', privateCount: privCount, communityCount: commCount },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  deal_private(options: { to_role?: string; count?: number; cards?: any; [k: string]: any } = {}): this {
    const target = options.to_role || '$context.targetRole';
    const meta = UNIVERSAL_GAME_PHASE_MATRIX.ALLOCATION;
    this.steps.push(CuratorCoreBuilder.setState({
      gamePhase: 'DEAL',
      universalPhase: meta.phase,
      fundamentalQuestion: meta.fundamentalQuestion,
      playerAgency: meta.playerAgency,
      turn: '$context.turn + 1',
      [`private_hand_${target}`]: options.cards || options.count || 2,
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'dialog',
      speechAct: 'INFORM',
      roomUri: this.tableUri,
      targetRole: target,
      topic: 'game:deal:private',
      payload: { action: 'deal_private', count: options.count || 2, cards: options.cards, ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  deal_public(options: { count?: number; cards?: any; starter?: string; [k: string]: any } = {}): this {
    const meta = UNIVERSAL_GAME_PHASE_MATRIX.ALLOCATION;
    this.steps.push(CuratorCoreBuilder.setState({
      gamePhase: 'DEAL',
      universalPhase: meta.phase,
      fundamentalQuestion: meta.fundamentalQuestion,
      playerAgency: meta.playerAgency,
      turn: '$context.turn + 1',
      communityCards: options.cards || options.count || 3,
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'INFORM',
      roomUri: this.tableUri,
      topic: 'game:deal:public',
      payload: { action: 'deal_public', ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  hit(options: { as_role?: string; count?: number; [k: string]: any } = {}): this {
    return this.draw({ count: 1, ...options, action: 'hit' });
  }

  draw(options: { as_role?: string; count?: number; from?: 'deck' | 'discard'; [k: string]: any } = {}): this {
    const act = options.action || 'draw';
    const meta = UNIVERSAL_GAME_PHASE_MATRIX.INTERACTION;
    this.steps.push(CuratorCoreBuilder.setState({
      gamePhase: 'INTERACTION',
      universalPhase: meta.phase,
      fundamentalQuestion: meta.fundamentalQuestion,
      playerAgency: meta.playerAgency,
      microTurn: 'ACQUISITION',
      turn: '$context.turn + 1',
      lastAcquisition: act,
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'REQUEST',
      roomUri: this.tableUri,
      senderRole: options.as_role || '$context.senderRole',
      topic: `resource:${act}`,
      payload: { action: act, count: options.count || 1, from: options.from || 'deck', ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  discard(options: { as_role?: string; cards?: any; count?: number; [k: string]: any } = {}): this {
    const meta = UNIVERSAL_GAME_PHASE_MATRIX.INTERACTION;
    this.steps.push(CuratorCoreBuilder.setState({
      gamePhase: 'INTERACTION',
      universalPhase: meta.phase,
      fundamentalQuestion: meta.fundamentalQuestion,
      playerAgency: meta.playerAgency,
      microTurn: 'DISCARD',
      turn: '$context.turn + 1',
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'INFORM',
      roomUri: this.tableUri,
      senderRole: options.as_role || '$context.senderRole',
      topic: 'resource:discard',
      payload: { action: 'discard', ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  swap(options: { as_role?: string; discard?: any; drawCount?: number; [k: string]: any } = {}): this {
    this.discard({ as_role: options.as_role, cards: options.discard });
    return this.draw({ as_role: options.as_role, count: options.drawCount || 1 });
  }

  lead(options: { as_role?: string; card?: any; suit?: string; rank?: any; [k: string]: any }): this {
    return this.play_card({ action: 'lead', ...options });
  }

  play_card(options: { as_role?: string; card?: any; suit?: string; rank?: any; [k: string]: any }): this {
    const act = options.action || 'play';
    const meta = UNIVERSAL_GAME_PHASE_MATRIX.INTERACTION;
    this.steps.push(CuratorCoreBuilder.setState({
      gamePhase: 'EXECUTION',
      universalPhase: meta.phase,
      fundamentalQuestion: meta.fundamentalQuestion,
      playerAgency: meta.playerAgency,
      microTurn: 'PLAY',
      turn: '$context.turn + 1',
      lastCardPlayed: options.card || options,
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'INFORM',
      roomUri: this.tableUri,
      senderRole: options.as_role || '$context.senderRole',
      topic: 'trick:play',
      payload: { action: act, ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  capture(options: { winner_role?: string; trickId?: string; cards?: any[]; points?: number; [k: string]: any } = {}): this {
    const meta = UNIVERSAL_GAME_PHASE_MATRIX.INTERACTION;
    this.steps.push(CuratorCoreBuilder.setState({
      gamePhase: 'EXECUTION',
      universalPhase: meta.phase,
      fundamentalQuestion: meta.fundamentalQuestion,
      playerAgency: meta.playerAgency,
      microTurn: 'CAPTURE',
      turn: '$context.turn + 1',
      lastTrickWinner: options.winner_role || '$context.trickWinner',
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'INFORM',
      roomUri: this.tableUri,
      topic: 'trick:capture',
      payload: { action: 'capture', ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  street(streetName: string, communityCount = 1): this {
    this.steps.push(CuratorCoreBuilder.setState({
      gamePhase: 'STREET',
      turn: '$context.turn + 1',
      currentStreet: streetName,
      communityCardCount: `$context.communityCardCount + ${communityCount}`,
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'INFORM',
      roomUri: this.tableUri,
      topic: `street:${streetName}`,
      payload: { street: streetName, communityCardsDealt: communityCount },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  // ==========================================================================
  // 3. YIELDING & CONTESTATION (Managing Collision)
  // ==========================================================================

  /**
   * Check / Deferral: Passing the conversational turn or game initiative to
   * another party while preserving one's current posture.
   * Analogs: Checking in poker | Nodding / pausing | Liturgical silence | Yielding time
   */
  check(options: { as_role?: string; note?: string; [k: string]: any } = {}): this {
    const meta = UNIVERSAL_INTERACTION_MATRIX.YIELDING_CONTESTATION;
    this.steps.push(CuratorCoreBuilder.setState({
      interactionPrimitive: meta.primitive,
      interactionAct: 'check',
      turn: '$context.turn + 1',
      initiativePassed: true,
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'ACCEPT',
      roomUri: this.tableUri,
      senderRole: options.as_role || '$context.senderRole',
      topic: 'contestation:check',
      payload: { action: 'check', ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  defer(options: { as_role?: string; to_role?: string; [k: string]: any } = {}): this {
    const meta = UNIVERSAL_INTERACTION_MATRIX.YIELDING_CONTESTATION;
    this.steps.push(CuratorCoreBuilder.setState({
      interactionPrimitive: meta.primitive,
      interactionAct: 'defer',
      turn: '$context.turn + 1',
      deferredTo: options.to_role,
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'ACCEPT',
      roomUri: this.tableUri,
      senderRole: options.as_role || '$context.senderRole',
      topic: 'contestation:defer',
      payload: { action: 'defer', ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  /**
   * Challenge / Interrogation: Directly disputing the validity, authority,
   * or truthfulness of a posture.
   * Analogs: Calling a bluff ("Bullshit") | Pointing out contradiction | Calling out heresy / taboo | Objection
   */
  challenge(options: { as_role?: string; target_role?: string; interrogation?: string; basis?: string; [k: string]: any } = {}): this {
    const meta = UNIVERSAL_INTERACTION_MATRIX.YIELDING_CONTESTATION;
    this.steps.push(CuratorCoreBuilder.setState({
      interactionPrimitive: meta.primitive,
      gamePhase: 'CONTESTATION',
      universalPhase: 'INTERACTION',
      microTurn: 'RESPONSE',
      turn: '$context.turn + 1',
      lastContestation: 'challenge',
      lastChallenge: options,
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'VOTE',
      roomUri: this.tableUri,
      senderRole: options.as_role || '$context.senderRole',
      topic: 'contestation:challenge',
      payload: { action: 'challenge', ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  interrogate(options: any = {}): this {
    return this.challenge(options);
  }

  /**
   * Yield / Concession: Surrendering a claim, folding a hand, admitting an error,
   * or prostrating before authority to prevent fatal escalation.
   */
  yield(options: { as_role?: string; concession?: string; reason?: string; [k: string]: any } = {}): this {
    const meta = UNIVERSAL_INTERACTION_MATRIX.YIELDING_CONTESTATION;
    this.steps.push(CuratorCoreBuilder.setState({
      interactionPrimitive: meta.primitive,
      gamePhase: 'CONTESTATION',
      universalPhase: 'INTERACTION',
      microTurn: 'RESPONSE',
      turn: '$context.turn + 1',
      lastContestation: 'yield',
      lastConcession: options,
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'REJECT',
      roomUri: this.tableUri,
      senderRole: options.as_role || '$context.senderRole',
      topic: 'contestation:yield',
      payload: { action: 'yield', ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  concede(options: any = {}): this {
    return this.yield(options);
  }

  fold(options: { as_role?: string; [k: string]: any } = {}): this {
    return this.contestation({ action: 'fold', ...options });
  }

  stand(options: { as_role?: string; [k: string]: any } = {}): this {
    return this.contestation({ action: 'stand', ...options });
  }

  call(options: { as_role?: string; amount?: number; [k: string]: any } = {}): this {
    return this.contestation({ action: 'call', ...options });
  }

  contestation(options: { action?: 'call' | 'fold' | 'stand' | 'challenge' | 'double_down'; as_role?: string; timeout?: string | number; [k: string]: any } = {}): this {
    const act = options.action || 'call';
    const meta = UNIVERSAL_GAME_PHASE_MATRIX.INTERACTION;
    this.steps.push(CuratorCoreBuilder.setState({
      gamePhase: 'CONTESTATION',
      universalPhase: meta.phase,
      fundamentalQuestion: meta.fundamentalQuestion,
      playerAgency: meta.playerAgency,
      microTurn: 'RESPONSE',
      turn: '$context.turn + 1',
      lastContestation: act,
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: act === 'fold' ? 'REJECT' : (act === 'challenge' ? 'VOTE' : 'ACCEPT'),
      roomUri: this.tableUri,
      senderRole: options.as_role || '$context.senderRole',
      topic: `contestation:${act}`,
      payload: { action: act, ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  // ==========================================================================
  // 4. VERIFICATION & REVELATION (Collapsing Entropy)
  // ==========================================================================

  /**
   * Expose / Showdown: The compulsory act of turning internal belief or hidden
   * private assets into public, auditable fact.
   * Analogs: Showdown (cards tabled) | Producing proof / confessing | Taking solemn public vow | Admitting Exhibit A
   */
  expose(options: {
    as_role?: string;
    evidence?: any;
    cards?: any;
    revealAll?: boolean;
    evaluator?: string;
    [k: string]: any;
  } = {}): this {
    const meta = UNIVERSAL_INTERACTION_MATRIX.VERIFICATION_REVELATION;
    this.steps.push(CuratorCoreBuilder.setState({
      interactionPrimitive: meta.primitive,
      gamePhase: 'SHOWDOWN',
      universalPhase: 'VERIFICATION',
      turn: '$context.turn + 1',
      showdownStatus: 'VERIFYING',
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'SYNTHESIZE',
      roomUri: this.tableUri,
      senderRole: options.as_role || '$context.senderRole',
      topic: 'interaction:expose',
      payload: {
        action: 'expose',
        evaluator: options.evaluator || 'standard_rules',
        revealAll: options.revealAll ?? true,
        ...options,
      },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  showdown(options: { evaluator?: string; revealAll?: boolean; [k: string]: any } = {}): this {
    const meta = UNIVERSAL_GAME_PHASE_MATRIX.VERIFICATION;
    this.steps.push(CuratorCoreBuilder.setState({
      gamePhase: 'SHOWDOWN',
      universalPhase: meta.phase,
      fundamentalQuestion: meta.fundamentalQuestion,
      playerAgency: meta.playerAgency,
      turn: '$context.turn + 1',
      showdownStatus: 'VERIFYING',
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'SYNTHESIZE',
      roomUri: this.tableUri,
      topic: 'game:showdown',
      payload: {
        action: 'showdown',
        evaluator: options.evaluator || 'standard_rules',
        revealAll: options.revealAll ?? true,
        ...options,
      },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  reveal(options: { as_role?: string; cards?: any; [k: string]: any } = {}): this {
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'INFORM',
      roomUri: this.tableUri,
      senderRole: options.as_role || '$context.senderRole',
      topic: 'game:reveal',
      payload: { action: 'reveal', ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  /**
   * Ratification / Witnessing: The collective acknowledgment by observers or opponents
   * that a move was legal, a vow was taken, or a win condition was met.
   * Analogs: Pushing pot to winner | "I understand and agree" | "I now pronounce you..." | Jury verdict
   */
  ratify(options: {
    as_role?: string;
    witnesses?: string[];
    verdict?: string;
    covenant?: any;
    [k: string]: any;
  } = {}): this {
    const meta = UNIVERSAL_INTERACTION_MATRIX.VERIFICATION_REVELATION;
    this.steps.push(CuratorCoreBuilder.setState({
      interactionPrimitive: meta.primitive,
      interactionAct: 'ratify',
      turn: '$context.turn + 1',
      ratificationStatus: 'RATIFIED',
      verdict: options.verdict || '$context.declaredVerdict',
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'SYNTHESIZE',
      roomUri: this.tableUri,
      senderRole: options.as_role || '$context.senderRole',
      topic: 'interaction:ratify',
      payload: { action: 'ratify', ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  witness(options: any = {}): this {
    return this.ratify(options);
  }

  // ==========================================================================
  // 5. SETTLEMENT & ACCOUNTING (State Rebalance)
  // ==========================================================================

  /**
   * Levy / Toll: The price exacted for a violation, a failed gamble, or an
   * institutional privilege (e.g., penalty, lost face, social shame, monetary fine).
   * Analogs: Rake / penalty | Lost face / retraction | Penance / tithe | Sanctions / fine
   */
  levy(options: {
    target_role?: string;
    as_role?: string;
    amount?: number;
    currency?: string;
    penalty?: string;
    faceLoss?: number;
    [k: string]: any;
  } = {}): this {
    const meta = UNIVERSAL_INTERACTION_MATRIX.SETTLEMENT_ACCOUNTING;
    this.steps.push(CuratorCoreBuilder.setState({
      interactionPrimitive: meta.primitive,
      interactionAct: 'levy',
      turn: '$context.turn + 1',
      lastLevy: options,
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'INFORM',
      roomUri: this.tableUri,
      senderRole: options.as_role || '$context.senderRole',
      topic: 'interaction:levy',
      payload: { action: 'levy', ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  toll(options: any = {}): this {
    return this.levy(options);
  }

  /**
   * Clear / Reset: Wiping the communicative slate to return to baseline—
   * shuffling the deck, saying "amen," exchanging parting handshakes, or resolving tension.
   */
  clear(options: { as_role?: string; scope?: string; resetSlate?: boolean; [k: string]: any } = {}): this {
    const meta = UNIVERSAL_INTERACTION_MATRIX.SETTLEMENT_ACCOUNTING;
    this.steps.push(CuratorCoreBuilder.setState({
      interactionPrimitive: meta.primitive,
      interactionAct: 'clear',
      turn: '$context.turn + 1',
      slateStatus: 'CLEARED',
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'INFORM',
      roomUri: this.tableUri,
      senderRole: options.as_role || '$context.senderRole',
      topic: 'interaction:clear',
      payload: { action: 'clear', ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  reset(options: any = {}): this {
    return this.clear(options);
  }

  settlement(options: { winner?: string; pot?: number; points?: Record<string, number>; rotateDealer?: boolean; [k: string]: any } = {}): this {
    const meta = UNIVERSAL_GAME_PHASE_MATRIX.SETTLEMENT;
    this.steps.push(CuratorCoreBuilder.setState({
      gamePhase: 'SETTLEMENT',
      universalPhase: meta.phase,
      fundamentalQuestion: meta.fundamentalQuestion,
      playerAgency: meta.playerAgency,
      turn: '$context.turn + 1',
      roundStatus: 'CONCLUDED',
      winner: options.winner || '$context.declaredWinner',
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'INFORM',
      roomUri: this.tableUri,
      topic: 'game:settlement',
      payload: {
        action: 'settlement',
        winner: options.winner,
        rotateDealer: options.rotateDealer ?? true,
        ...options,
      },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  rotate_dealer(options: { next_role?: string; [k: string]: any } = {}): this {
    const meta = UNIVERSAL_GAME_PHASE_MATRIX.SETTLEMENT;
    this.steps.push(CuratorCoreBuilder.setState({
      universalPhase: meta.phase,
      fundamentalQuestion: meta.fundamentalQuestion,
      playerAgency: meta.playerAgency,
      turn: '$context.turn + 1',
      dealer: options.next_role || '$context.nextDealer',
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'INFORM',
      roomUri: this.tableUri,
      topic: 'game:rotate_dealer',
      payload: { action: 'rotate_dealer', ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  // ==========================================================================
  // 6. META-ACTS (Rules of the Rule-Set)
  // ==========================================================================

  /**
   * Repair: Quick, conversational micro-adjustments made when an interaction goes off track
   * ("I was only joking," "Let me rephrase," "Takeback permitted").
   * Analogs: Floor judge / misdeal call | "Sorry, that came out wrong" | Apology / atonement | Striking from record
   */
  repair(options: {
    as_role?: string;
    adjustment?: string;
    correction?: string;
    apology?: string;
    [k: string]: any;
  } = {}): this {
    const meta = UNIVERSAL_INTERACTION_MATRIX.META_ACTS;
    this.steps.push(CuratorCoreBuilder.setState({
      interactionPrimitive: meta.primitive,
      interactionAct: 'repair',
      turn: '$context.turn + 1',
      lastRepair: options,
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'REQUEST',
      roomUri: this.tableUri,
      senderRole: options.as_role || '$context.senderRole',
      topic: 'interaction:repair',
      payload: { action: 'repair', ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  /**
   * Rupture (Spoilsporting): Refusing to honor the frame itself, breaking both
   * the rules and the social contract that sustains the illusion.
   * Analogs: Table flip / walkaway | Hanging up / storming out | Desecration / apostasy | Contempt of court / walkout
   */
  rupture(options: {
    as_role?: string;
    breachType?: 'spoilsport' | 'walkout' | 'table_flip' | 'heresy' | 'contempt';
    reason?: string;
    [k: string]: any;
  } = {}): this {
    const meta = UNIVERSAL_INTERACTION_MATRIX.META_ACTS;
    this.steps.push(CuratorCoreBuilder.setState({
      interactionPrimitive: meta.primitive,
      interactionAct: 'rupture',
      turn: '$context.turn + 1',
      ruptureStatus: 'FRAME_BROKEN',
      lastRupture: options,
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'REJECT',
      roomUri: this.tableUri,
      senderRole: options.as_role || '$context.senderRole',
      topic: 'interaction:rupture',
      payload: { action: 'rupture', ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  // ==========================================================================
  // 7. TRICKSTER META-OPERATIONS (Frame Subversion & Semiotic Sabotage)
  // ==========================================================================

  hijack_frame(options: {
    newFrame?: string;
    targetFrame?: string;
    smuggledStakes?: any;
    slapstick?: boolean;
    as_role?: string;
    [k: string]: any;
  } = {}): this {
    const role = options.as_role || '$context.senderRole';
    this.steps.push(CuratorCoreBuilder.setState({
      interactionPrimitive: 'FRAME_BOUNDARY',
      tricksterAction: 'FRAME_HIJACK',
      frameHijacked: true,
      frame: options.newFrame || 'subverted_frame',
      smuggledStakes: options.smuggledStakes || null,
      turn: '$context.turn + 1',
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
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

  feign_stance(options: {
    apparentStance?: string;
    target?: string;
    pietyLevel?: string;
    innerIntent?: string;
    as_role?: string;
    [k: string]: any;
  } = {}): this {
    const role = options.as_role || '$context.senderRole';
    const apparent = options.apparentStance || 'pious_innocence';
    this.steps.push(CuratorCoreBuilder.setState({
      interactionPrimitive: 'FRAME_BOUNDARY',
      tricksterAction: 'PERVERSE_STANCE',
      apparentStance: apparent,
      innerIntent: options.innerIntent || 'subversive_critique',
      turn: '$context.turn + 1',
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
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

  asymmetric_buy_in(options: {
    target_role?: string;
    opponentStake?: any;
    selfStake?: any;
    bait?: string;
    as_role?: string;
    [k: string]: any;
  } = {}): this {
    const role = options.as_role || '$context.senderRole';
    this.steps.push(CuratorCoreBuilder.setState({
      interactionPrimitive: 'FRAME_BOUNDARY',
      tricksterAction: 'ASYMMETRIC_BUY_IN',
      opponentStake: options.opponentStake,
      selfStake: options.selfStake ?? 0,
      turn: '$context.turn + 1',
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
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

  hyper_comply(options: {
    ruleOrCommand?: string;
    command?: string;
    literalInterpretation?: string;
    extremeResult?: any;
    exposedAssumption?: string;
    as_role?: string;
    [k: string]: any;
  } = {}): this {
    const role = options.as_role || '$context.senderRole';
    const literal = options.literalInterpretation || options.command || options.ruleOrCommand || 'literal_code';
    this.steps.push(CuratorCoreBuilder.setState({
      interactionPrimitive: 'POSTURING_ASSERTION',
      tricksterAction: 'MALICIOUS_HYPER_COMPLIANCE',
      literalInterpretation: literal,
      extremeResult: options.extremeResult,
      exposedAssumption: options.exposedAssumption,
      turn: '$context.turn + 1',
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
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

  counterfeit_signal(options: {
    mimickedSignal?: string;
    projectedPosture?: string;
    apparentCost?: any;
    actualCost?: number;
    targetBelief?: string;
    as_role?: string;
    [k: string]: any;
  } = {}): this {
    const role = options.as_role || '$context.senderRole';
    this.steps.push(CuratorCoreBuilder.setState({
      interactionPrimitive: 'POSTURING_ASSERTION',
      tricksterAction: 'COUNTERFEIT_SIGNAL',
      mimickedSignal: options.mimickedSignal || options.projectedPosture,
      actualCost: options.actualCost ?? 0,
      turn: '$context.turn + 1',
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
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

  bait_escalation(options: {
    target_role?: string;
    baitTarget?: 'vanity' | 'greed' | 'righteousness' | 'fear';
    provocation?: string;
    expectedEscalation?: any;
    as_role?: string;
    [k: string]: any;
  } = {}): this {
    const role = options.as_role || '$context.senderRole';
    this.steps.push(CuratorCoreBuilder.setState({
      interactionPrimitive: 'POSTURING_ASSERTION',
      tricksterAction: 'BAITING_ESCALATION',
      targetVulnerability: options.baitTarget || 'vanity',
      turn: '$context.turn + 1',
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
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

  deflect_challenge(options: {
    challenger?: string;
    redefinition?: string;
    pivotFrame?: string;
    deflectionReason?: string;
    as_role?: string;
    [k: string]: any;
  } = {}): this {
    const role = options.as_role || '$context.senderRole';
    this.steps.push(CuratorCoreBuilder.setState({
      interactionPrimitive: 'YIELDING_CONTESTATION',
      tricksterAction: 'DEFLECT_CHALLENGE',
      redefinition: options.redefinition,
      challengeDeflected: true,
      turn: '$context.turn + 1',
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
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

  parody_yield(options: {
    theatrics?: string;
    feignedProstration?: boolean;
    hiddenMotive?: string;
    as_role?: string;
    [k: string]: any;
  } = {}): this {
    const role = options.as_role || '$context.senderRole';
    this.steps.push(CuratorCoreBuilder.setState({
      interactionPrimitive: 'YIELDING_CONTESTATION',
      tricksterAction: 'PARODY_YIELD',
      feignedSubmission: true,
      hiddenMotive: options.hiddenMotive || 'disarm_vengeance',
      turn: '$context.turn + 1',
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
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

  ungraspable_check(options: {
    riddle?: string;
    evasion?: string;
    as_role?: string;
    [k: string]: any;
  } = {}): this {
    const role = options.as_role || '$context.senderRole';
    this.steps.push(CuratorCoreBuilder.setState({
      interactionPrimitive: 'YIELDING_CONTESTATION',
      tricksterAction: 'UNGRASPABLE_CHECK',
      feedbackLoopStarved: true,
      riddle: options.riddle,
      turn: '$context.turn + 1',
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
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

  staged_expose(options: {
    exposedRole?: string;
    targetHypocrisy?: string;
    evidence?: any;
    escapeRoute?: string;
    as_role?: string;
    [k: string]: any;
  } = {}): this {
    const role = options.as_role || '$context.senderRole';
    this.steps.push(CuratorCoreBuilder.setState({
      interactionPrimitive: 'VERIFICATION_REVELATION',
      tricksterAction: 'STAGED_EXPOSE',
      exposedHypocrite: options.exposedRole,
      ambushStaged: true,
      turn: '$context.turn + 1',
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
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

  refuse_ratification(options: {
    dismissalReason?: string;
    partingMockery?: string;
    deniedClosure?: boolean;
    as_role?: string;
    [k: string]: any;
  } = {}): this {
    const role = options.as_role || '$context.senderRole';
    this.steps.push(CuratorCoreBuilder.setState({
      interactionPrimitive: 'VERIFICATION_REVELATION',
      tricksterAction: 'REFUSE_RATIFICATION',
      moralWeightRejected: true,
      closureDenied: true,
      turn: '$context.turn + 1',
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
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

  evade_toll(options: {
    penaltyEvaded?: any;
    reinterpretation?: string;
    stageTurned?: boolean;
    as_role?: string;
    [k: string]: any;
  } = {}): this {
    const role = options.as_role || '$context.senderRole';
    this.steps.push(CuratorCoreBuilder.setState({
      interactionPrimitive: 'SETTLEMENT_ACCOUNTING',
      tricksterAction: 'TOLL_EVASION',
      tollPaid: false,
      cageTurnedToStage: options.stageTurned ?? true,
      turn: '$context.turn + 1',
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
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

  invert_value(options: {
    originalCurrency?: string;
    invertedValue?: string;
    absurdityRatio?: any;
    as_role?: string;
    [k: string]: any;
  } = {}): this {
    const role = options.as_role || '$context.senderRole';
    this.steps.push(CuratorCoreBuilder.setState({
      interactionPrimitive: 'SETTLEMENT_ACCOUNTING',
      tricksterAction: 'VALUE_INVERSION',
      currencyDisrupted: true,
      goldToLeaves: true,
      turn: '$context.turn + 1',
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
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

  creative_rupture(options: {
    revelation?: string;
    shatteredIllusion?: string;
    as_role?: string;
    [k: string]: any;
  } = {}): this {
    const role = options.as_role || '$context.senderRole';
    this.steps.push(CuratorCoreBuilder.setState({
      interactionPrimitive: 'META_ACTS',
      tricksterAction: 'CREATIVE_RUPTURE',
      illusionShattered: options.shatteredIllusion || 'revealing_cardboard_board',
      turn: '$context.turn + 1',
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
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

  forced_repair(options: {
    unexaminedAssumption?: string;
    newRule?: string;
    evolutionaryOutcome?: string;
    as_role?: string;
    [k: string]: any;
  } = {}): this {
    const role = options.as_role || '$context.senderRole';
    this.steps.push(CuratorCoreBuilder.setState({
      interactionPrimitive: 'META_ACTS',
      tricksterAction: 'FORCED_REPAIR',
      systemicEvolution: true,
      newRule: options.newRule,
      turn: '$context.turn + 1',
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
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
  // 8. DIALOGUE GAMES & PUBLIC COMMITMENT STORES (Walton & Krabbe / Deontic)
  // ==========================================================================

  /**
   * Propose a collaborative contract / initiative (Commissive / Directive).
   * Appends a pending conditional commitment to the shared Commitment Store C.
   * e.g., "If you defend the gate, I will fetch the key"
   */
  propose_contract(options: {
    commitmentId?: string;
    id?: string;
    action?: any;
    actionPayload?: any;
    condition?: string;
    terms?: any;
    deadline?: number;
    deadlineTick?: number;
    as_role?: string;
    target_role?: string;
    [k: string]: any;
  }): this {
    const role = options.as_role || '$context.senderRole';
    const target = options.target_role || 'BROADCAST';
    const cId = options.commitmentId || options.id || `cmt_${Date.now()}`;
    const payload = options.actionPayload || options.action || options.terms;

    this.steps.push(CuratorCoreBuilder.setState({
      interactionPrimitive: 'POSTURING_ASSERTION',
      currentPhase: 'STRATEGY',
      proposalPending: true,
      lastCommitmentId: cId,
      [`commitment_${cId}`]: {
        id: cId,
        obligor: role,
        beneficiary: target,
        actionPayload: payload,
        condition: options.condition || null,
        deadlineTick: options.deadlineTick || options.deadline || 10,
        status: 'PENDING',
      },
      turn: '$context.turn + 1',
    }));

    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'PROPOSE',
      roomUri: this.tableUri,
      senderRole: role,
      targetRole: target !== 'BROADCAST' ? target : undefined,
      topic: 'dialogue:propose',
      payload: {
        action: 'propose_contract',
        commitmentId: cId,
        obligor: role,
        beneficiary: target,
        actionPayload: payload,
        condition: options.condition,
        deadlineTick: options.deadlineTick || options.deadline,
        ...options,
      },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  propose(options: any): this {
    return this.propose_contract(options);
  }

  /**
   * Ratifies a proposed collaborative contract.
   * Moves a proposal from 'PENDING' to 'RATIFIED' in the public Commitment Store.
   */
  accept_contract(options: {
    commitmentId?: string;
    id?: string;
    as_role?: string;
    [k: string]: any;
  } = {}): this {
    const role = options.as_role || '$context.senderRole';
    const cId = options.commitmentId || options.id || '$context.lastCommitmentId';

    this.steps.push(CuratorCoreBuilder.setState({
      interactionPrimitive: 'YIELDING_CONTESTATION',
      currentPhase: 'EXECUTION',
      proposalPending: false,
      contractActive: true,
      [`commitment_${cId}_status`]: 'RATIFIED',
      lastRatifiedCommitment: cId,
      turn: '$context.turn + 1',
    }));

    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'ACCEPT',
      roomUri: this.tableUri,
      senderRole: role,
      topic: 'dialogue:accept',
      payload: { action: 'accept_contract', commitmentId: cId, ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  accept(options: any = {}): this {
    return this.accept_contract(options);
  }

  /**
   * Rejects a proposed contract or cancels initiative.
   */
  reject_contract(options: {
    commitmentId?: string;
    id?: string;
    as_role?: string;
    reason?: string;
    [k: string]: any;
  } = {}): this {
    const role = options.as_role || '$context.senderRole';
    const cId = options.commitmentId || options.id || '$context.lastCommitmentId';

    this.steps.push(CuratorCoreBuilder.setState({
      interactionPrimitive: 'YIELDING_CONTESTATION',
      currentPhase: 'IDLE',
      proposalPending: false,
      [`commitment_${cId}_status`]: 'REJECTED',
      rejectionReason: options.reason || 'declined',
      turn: '$context.turn + 1',
    }));

    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'REJECT',
      roomUri: this.tableUri,
      senderRole: role,
      topic: 'dialogue:reject',
      payload: { action: 'reject_contract', commitmentId: cId, ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  reject(options: any = {}): this {
    return this.reject_contract(options);
  }

  /**
   * Epistemic assertion sharing private knowledge or game state.
   * Triggers a window for verification or dialectical challenge.
   */
  assert_claim(options: {
    claim: string;
    evidence_ref?: any;
    as_role?: string;
    [k: string]: any;
  }): this {
    const role = options.as_role || '$context.senderRole';

    this.steps.push(CuratorCoreBuilder.setState({
      interactionPrimitive: 'POSTURING_ASSERTION',
      informPending: true,
      lastAssertion: options.claim,
      lastEvidence: options.evidence_ref || null,
      turn: '$context.turn + 1',
    }));

    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'ASSERT',
      roomUri: this.tableUri,
      senderRole: role,
      topic: 'dialogue:assert',
      payload: { action: 'assert_claim', evidence: options.evidence_ref, ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  assert(options: any): this {
    return this.assert_claim(options);
  }

  /**
   * Directive query soliciting missing information or intent.
   * Sets a Deontic expectation obligation O(target, REPLY) on the receiving player.
   */
  query(options: {
    predicate?: string;
    query?: string;
    target_role?: string;
    as_role?: string;
    [k: string]: any;
  }): this {
    const role = options.as_role || '$context.senderRole';
    const target = options.target_role || 'BROADCAST';
    const pred = options.predicate || options.query || 'status';

    this.steps.push(CuratorCoreBuilder.setState({
      interactionPrimitive: 'YIELDING_CONTESTATION',
      deonticObligation: `O(${target}, REPLY)`,
      openQuestion: pred,
      turn: '$context.turn + 1',
    }));

    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'QUERY',
      roomUri: this.tableUri,
      senderRole: role,
      targetRole: target !== 'BROADCAST' ? target : undefined,
      topic: 'dialogue:query',
      payload: { action: 'query', predicate: pred, targetRole: target, ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  /**
   * Synchronized trigger where multiple players execute their agreed actions simultaneously.
   * Advances active contracts to FULFILLED and returns Dialogue state to IDLE.
   */
  execute_sync(options: {
    actionId?: string;
    actionPayload?: any;
    actors?: string[];
    commitmentIds?: string[];
    as_role?: string;
    [k: string]: any;
  } = {}): this {
    const role = options.as_role || '$context.senderRole';
    const actId = options.actionId || `sync_${Date.now()}`;

    this.steps.push(CuratorCoreBuilder.setState({
      interactionPrimitive: 'VERIFICATION_REVELATION',
      currentPhase: 'IDLE',
      contractActive: false,
      lastSyncExecution: actId,
      commitmentsFulfilled: true,
      turn: '$context.turn + 1',
    }));

    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'ACCEPT',
      roomUri: this.tableUri,
      senderRole: role,
      topic: 'dialogue:execute_sync',
      payload: { action: 'execute_sync', actionId: actId, actors: options.actors || [], ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  /**
   * Defection & Betrayal Tracking:
   * Records failure to perform an agreed commitment phi, applies a systemic
   * reputation penalty in the ledger, and shifts phase to ARBITRATION.
   */
  violate_contract(options: {
    commitmentId?: string;
    id?: string;
    actor?: string;
    as_role?: string;
    defectionReason?: string;
    reputationPenalty?: number;
    [k: string]: any;
  } = {}): this {
    const role = options.actor || options.as_role || '$context.senderRole';
    const cId = options.commitmentId || options.id || '$context.lastCommitmentId';
    const penalty = options.reputationPenalty ?? 15;

    this.steps.push(CuratorCoreBuilder.setState({
      interactionPrimitive: 'YIELDING_CONTESTATION',
      currentPhase: 'ARBITRATION',
      [`commitment_${cId}_status`]: 'VIOLATED',
      defectionDetected: true,
      defector: role,
      reputationPenalty: penalty,
      [`reputation_${role}`]: `$context.reputation_${role} - ${penalty}`,
      turn: '$context.turn + 1',
    }));

    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'REJECT',
      roomUri: this.tableUri,
      senderRole: role,
      topic: 'dialogue:defection',
      payload: {
        action: 'violate_contract',
        commitmentId: cId,
        defector: role,
        reputationPenalty: penalty,
        reason: options.defectionReason || 'unfulfilled_contract',
        ...options,
      },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  defection(options: any = {}): this {
    return this.violate_contract(options);
  }

  /**
   * Explicitly marks a commitment as fulfilled without full execute_sync.
   */
  fulfill_contract(options: {
    commitmentId?: string;
    id?: string;
    as_role?: string;
    [k: string]: any;
  } = {}): this {
    const role = options.as_role || '$context.senderRole';
    const cId = options.commitmentId || options.id || '$context.lastCommitmentId';

    this.steps.push(CuratorCoreBuilder.setState({
      interactionPrimitive: 'SETTLEMENT_ACCOUNTING',
      [`commitment_${cId}_status`]: 'FULFILLED',
      turn: '$context.turn + 1',
    }));

    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'INFORM',
      roomUri: this.tableUri,
      senderRole: role,
      topic: 'dialogue:fulfill',
      payload: { action: 'fulfill_contract', commitmentId: cId, ...options },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  // ==========================================================================
  // 8. DUAL-TRACK INTERACTION: Spontaneous Ambient Speech Acts & Table Talk
  // ==========================================================================

  /**
   * Spontaneous out-of-turn Table Talk:
   * Enables players or observers to speak, banter, or read each other between turns.
   *
   * Crucial dual-track invariant:
   * - Does NOT advance formal game turn ($context.turn is NOT incremented).
   * - Does NOT alter formal game phase ($context.gamePhase remains untouched).
   * - Updates epistemic & conversational context ($context.banterCount, $context.tilt, etc.).
   * - Broadcasts an agent:message envelope to the table (recipients: '*').
   */
  table_talk(
    utteranceOrOptions?: string | AmbientSpeechActOptions,
    options: AmbientSpeechActOptions = {}
  ): this {
    const opts = typeof utteranceOrOptions === 'string'
      ? { utterance: utteranceOrOptions, ...options }
      : (utteranceOrOptions || options);

    const speaker = opts.as_role || '$context.senderRole || "player"';
    const utterance = opts.utterance || opts.prompt || '...';
    const tone = opts.tone || 'playful';
    const topic = opts.topic || 'table_talk:banter';

    const stateUpdates: Record<string, any> = {
      lastAmbientAct: 'TABLE_TALK',
      lastAmbientSpeaker: speaker,
      lastAmbientUtterance: utterance,
      banterCount: '$context.banterCount + 1',
      ...(opts.epistemicImpact || {}),
    };

    if (opts.tiltDelta) {
      const target = opts.target_role || speaker;
      stateUpdates[`tilt_${target}`] = `$context.tilt_${target} + ${opts.tiltDelta}`;
    }

    if (opts.suspicionDelta) {
      const target = opts.target_role || speaker;
      stateUpdates[`suspicion_${target}`] = `$context.suspicion_${target} + ${opts.suspicionDelta}`;
    }

    this.steps.push(CuratorCoreBuilder.setState(stateUpdates));

    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      communicationForm: 'polylogue',
      turnDynamics: 'moderated_floor',
      speechAct: 'INFORM',
      roomUri: this.tableUri,
      senderRole: speaker,
      recipients: '*',
      topic,
      payload: {
        action: 'table_talk',
        ambientAct: 'TABLE_TALK',
        utterance,
        speaker,
        tone,
        outOfTurn: true,
        temperature: opts.temperature ?? 0.7,
        prompt: opts.prompt,
        ...opts,
      },
      turn: '$context.turn', // Stays on current formal turn!
      conversationId: this.tableUri,
    }));

    return this;
  }

  /**
   * Playful verbal sparring and banter between turns.
   */
  banter(
    utteranceOrOptions?: string | AmbientSpeechActOptions,
    options: AmbientSpeechActOptions = {}
  ): this {
    const opts = typeof utteranceOrOptions === 'string'
      ? { utterance: utteranceOrOptions, tone: 'playful' as const, ...options }
      : { tone: 'playful' as const, ...(utteranceOrOptions || options) };
    return this.table_talk(opts);
  }

  /**
   * Spontaneous Social Gossip:
   * Ambient side-activity where participants share anecdotes, rumors, or commentary
   * about a third party, fellow player, or outside event without affecting formal game turns.
   * Can be shared publicly (recipients: '*') or privately shared (recipients: [target_role]).
   *
   * Crucial insight: Gossip is NOT inherently a Trickster subversion; it is a universal
   * human side-activity that occurs naturally at every card table, ritual, and gathering.
   */
  gossip(
    rumorOrOptions?: string | AmbientSpeechActOptions,
    options: AmbientSpeechActOptions = {}
  ): this {
    const opts = typeof rumorOrOptions === 'string'
      ? { utterance: rumorOrOptions, ...options }
      : (rumorOrOptions || options);

    const speaker = opts.as_role || '$context.senderRole || "player"';
    const utterance = opts.utterance || opts.prompt || '...';
    const subject = opts.subject || 'someone';
    const target = opts.target_role;
    const isPrivate = Boolean(target);
    const tone = opts.tone || 'conspiratorial';
    const topic = opts.topic || (subject ? `gossip:${subject}` : 'gossip:social');

    const stateUpdates: Record<string, any> = {
      lastAmbientAct: 'GOSSIP',
      lastGossipSpeaker: speaker,
      lastGossipSubject: subject,
      lastGossipUtterance: utterance,
      gossipCount: '$context.gossipCount + 1',
      ...(opts.epistemicImpact || {}),
    };

    if (opts.affinityDelta) {
      const recipient = target || 'all';
      stateUpdates[`affinity_${speaker}_${recipient}`] = `$context.affinity_${speaker}_${recipient} + ${opts.affinityDelta}`;
    }

    if (opts.suspicionDelta) {
      stateUpdates[`suspicion_${subject}`] = `$context.suspicion_${subject} + ${opts.suspicionDelta}`;
    }

    this.steps.push(CuratorCoreBuilder.setState(stateUpdates));

    const recipients = isPrivate ? (Array.isArray(target) ? target : [target]) : '*';

    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: isPrivate ? 'dialog' : 'forum',
      communicationForm: isPrivate ? 'dialogue' : 'polylogue',
      turnDynamics: isPrivate ? 'private_reflection' : 'moderated_floor',
      speechAct: 'INFORM',
      roomUri: this.tableUri,
      senderRole: speaker,
      recipients,
      topic,
      payload: {
        ...opts,
        action: 'gossip',
        ambientAct: 'GOSSIP',
        speaker,
        subject,
        utterance,
        tone,
        outOfTurn: true,
        private: isPrivate,
        temperature: opts.temperature ?? 0.8,
      },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));

    return this;
  }

  /**
   * Universal Small Talk:
   * Casual, mundane conversation (the weather, drinks, food, day-to-day life)
   * that maintains social rapport between turns.
   */
  small_talk(
    utteranceOrOptions?: string | AmbientSpeechActOptions,
    options: AmbientSpeechActOptions = {}
  ): this {
    const opts = typeof utteranceOrOptions === 'string'
      ? { utterance: utteranceOrOptions, tone: 'friendly' as const, ...options }
      : { tone: 'friendly' as const, ...(utteranceOrOptions || options) };

    const speaker = opts.as_role || '$context.senderRole || "player"';
    const utterance = opts.utterance || opts.prompt || 'Nice day outside.';
    const topic = opts.topic || 'small_talk:casual';

    this.steps.push(CuratorCoreBuilder.setState({
      lastAmbientAct: 'SMALL_TALK',
      lastAmbientSpeaker: speaker,
      lastAmbientUtterance: utterance,
      smallTalkCount: '$context.smallTalkCount + 1',
      ...(opts.epistemicImpact || {}),
    }));

    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      communicationForm: 'polylogue',
      turnDynamics: 'moderated_floor',
      speechAct: 'INFORM',
      roomUri: this.tableUri,
      senderRole: speaker,
      recipients: '*',
      topic,
      payload: {
        ...opts,
        action: 'small_talk',
        ambientAct: 'SMALL_TALK',
        speaker,
        utterance,
        tone: opts.tone || 'friendly',
        outOfTurn: true,
        temperature: opts.temperature ?? 0.7,
      },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));

    return this;
  }

  /**
   * Ambient Side Activity / Micro-Action:
   * Tangential bodily or mundane actions happening around the game (e.g. pouring tea,
   * stacking chips, adjusting chair, checking watch) that ground the interaction order.
   */
  side_activity(
    activityOrOptions?: string | AmbientSpeechActOptions,
    options: AmbientSpeechActOptions = {}
  ): this {
    const opts = typeof activityOrOptions === 'string'
      ? { utterance: activityOrOptions, ...options }
      : (activityOrOptions || options);

    const actor = opts.as_role || '$context.senderRole || "player"';
    const activity = opts.utterance || 'sips drink';
    const topic = opts.topic || 'ambient:side_activity';

    this.steps.push(CuratorCoreBuilder.setState({
      lastAmbientAct: 'SIDE_ACTIVITY',
      lastSideActivityActor: actor,
      lastSideActivity: activity,
      sideActivityCount: '$context.sideActivityCount + 1',
      ...(opts.epistemicImpact || {}),
    }));

    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      communicationForm: 'polylogue',
      turnDynamics: 'moderated_floor',
      speechAct: 'INFORM',
      roomUri: this.tableUri,
      senderRole: actor,
      recipients: '*',
      topic,
      payload: {
        ...opts,
        action: 'side_activity',
        ambientAct: 'SIDE_ACTIVITY',
        actor,
        activity,
        outOfTurn: true,
      },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));

    return this;
  }

  /**
   * Private Bilateral Whisper / Side-Channel:
   * Enables covert, out-of-turn communication between two actors (e.g. secret allies,
   * conspirators, or side betters) invisible to the rest of the table.
   *
   * Form: conversationType: 'dialog', communicationForm: 'dialogue', recipients: [targetRole].
   */
  whisper(
    targetOrOptions: string | AmbientSpeechActOptions,
    utteranceOrOptions?: string | AmbientSpeechActOptions,
    options: AmbientSpeechActOptions = {}
  ): this {
    let opts: AmbientSpeechActOptions;
    if (typeof targetOrOptions === 'string') {
      if (typeof utteranceOrOptions === 'string') {
        opts = { target_role: targetOrOptions, utterance: utteranceOrOptions, ...options };
      } else {
        opts = { target_role: targetOrOptions, ...(utteranceOrOptions || options) };
      }
    } else {
      opts = { ...(targetOrOptions || options) };
    }

    const speaker = opts.as_role || '$context.senderRole || "player"';
    const target = opts.target_role || '$context.whisperTarget';
    const utterance = opts.utterance || opts.prompt || '...';
    const tone = opts.tone || 'conspiratorial';
    const topic = opts.topic || 'whisper:side_channel';

    const stateUpdates: Record<string, any> = {
      lastAmbientAct: 'WHISPER',
      lastWhisperSpeaker: speaker,
      lastWhisperTarget: target,
      whisperCount: '$context.whisperCount + 1',
      ...(opts.epistemicImpact || {}),
    };

    if (opts.suspicionDelta) {
      stateUpdates[`suspicion_${target}`] = `$context.suspicion_${target} + ${opts.suspicionDelta}`;
    }

    this.steps.push(CuratorCoreBuilder.setState(stateUpdates));

    const recipients = Array.isArray(target) ? target : [target];

    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'dialog',
      communicationForm: 'dialogue',
      turnDynamics: 'private_reflection',
      speechAct: 'INFORM',
      roomUri: this.tableUri,
      senderRole: speaker,
      recipients,
      topic,
      payload: {
        action: 'whisper',
        ambientAct: 'WHISPER',
        utterance,
        speaker,
        target,
        tone,
        outOfTurn: true,
        private: true,
        temperature: opts.temperature ?? 0.8,
        ...opts,
      },
      turn: '$context.turn', // Stays on current formal turn!
      conversationId: this.tableUri,
    }));

    return this;
  }

  side_channel(
    targetOrOptions: string | AmbientSpeechActOptions,
    utteranceOrOptions?: string | AmbientSpeechActOptions,
    options: AmbientSpeechActOptions = {}
  ): this {
    return this.whisper(targetOrOptions, utteranceOrOptions, options);
  }

  /**
   * Spontaneous Interjection:
   * An involuntary or sudden exclamation (gasp, scoff, exclamation of surprise, sudden tell)
   * triggered between turns, immediately populating the ambient telemetry.
   */
  interject(
    reactionOrOptions?: string | AmbientSpeechActOptions,
    options: AmbientSpeechActOptions = {}
  ): this {
    const opts = typeof reactionOrOptions === 'string'
      ? { utterance: reactionOrOptions, ...options }
      : (reactionOrOptions || options);

    const speaker = opts.as_role || '$context.senderRole || "observer"';
    const utterance = opts.utterance || '!';
    const topic = opts.topic || 'ambient:interjection';

    this.steps.push(CuratorCoreBuilder.setState({
      lastAmbientAct: 'INTERJECT',
      lastInterjection: utterance,
      interjectionSpeaker: speaker,
      interjectionCount: '$context.interjectionCount + 1',
      ...(opts.epistemicImpact || {}),
    }));

    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      communicationForm: 'polylogue',
      turnDynamics: 'moderated_floor',
      speechAct: 'INFORM',
      roomUri: this.tableUri,
      senderRole: speaker,
      recipients: '*',
      topic,
      payload: {
        action: 'interject',
        ambientAct: 'INTERJECT',
        utterance,
        speaker,
        outOfTurn: true,
        ...opts,
      },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));

    return this;
  }

  /**
   * Dual-Track Parallelism:
   * Runs the synchronous game state engine in parallel with an asynchronous
   * ambient conversation observer swarm or heckler/commentator thread.
   */
  parallel_ambient(
    ambientThread: CuratorAstNode | { build: () => CuratorAstNode }
  ): this {
    const ambientNode = typeof (ambientThread as any)?.build === 'function'
      ? (ambientThread as any).build()
      : ambientThread;

    const currentGameSeq = CuratorCoreBuilder.seq(`${this.tableUri}:game_thread`, ...this.steps);
    this.steps = [
      CuratorCoreBuilder.parallel(`${this.tableUri}:dual_track`, currentGameSeq, ambientNode)
    ];
    return this;
  }

  /**
   * Session Connection / Join:
   * Formal connection handshake registering participant, acquiring conversational role,
   * requesting ephemeral capability leases, and receiving initial state catch-up.
   */
  join(options: {
    agentId?: string;
    as_role?: string;
    conversationalRole?: string;
    capabilities?: string[];
    leaseDurationMs?: number;
    [k: string]: any;
  } = {}): this {
    const role = options.conversationalRole || options.as_role || '$context.senderRole || "player"';
    const agentId = options.agentId || '$context.agentId || "agent"';

    this.steps.push(CuratorCoreBuilder.setState({
      lastLifecycleAct: 'JOIN',
      lastJoinedAgent: agentId,
      lastJoinedRole: role,
      activeParticipantCount: '$context.activeParticipantCount + 1',
    }));

    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'JOIN',
      roomUri: this.tableUri,
      senderRole: role,
      recipients: '*',
      topic: 'session:join',
      payload: {
        action: 'join',
        agentId,
        conversationalRole: role,
        capabilities: options.capabilities || [],
        leaseDurationMs: options.leaseDurationMs,
        ...options,
      },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));

    return this;
  }

  connect(options: any = {}): this {
    return this.join(options);
  }

  /**
   * Session Leave / Concession:
   * Graceful exit or formal concession yielding floor, recalibrating quorum,
   * and revoking ephemeral leases.
   */
  leave(options: {
    agentId?: string;
    as_role?: string;
    reason?: string;
    concede?: boolean;
    graceful?: boolean;
    [k: string]: any;
  } = {}): this {
    const role = options.as_role || '$context.senderRole || "player"';
    const agentId = options.agentId || '$context.agentId || "agent"';

    this.steps.push(CuratorCoreBuilder.setState({
      lastLifecycleAct: 'LEAVE',
      lastLeftAgent: agentId,
      conceded: options.concede === true,
      activeParticipantCount: '$context.activeParticipantCount - 1',
    }));

    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'LEAVE',
      roomUri: this.tableUri,
      senderRole: role,
      recipients: '*',
      topic: 'session:leave',
      payload: {
        action: 'leave',
        agentId,
        reason: options.reason || 'normal_leave',
        concede: options.concede === true,
        graceful: options.graceful !== false,
        ...options,
      },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));

    return this;
  }

  /**
   * Heartbeat Presence Verification.
   */
  heartbeat(sessionId?: string): this {
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'HEARTBEAT',
      roomUri: this.tableUri,
      recipients: '*',
      topic: 'session:heartbeat',
      payload: { action: 'heartbeat', sessionId: sessionId || '$context.sessionId' },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  /**
   * State Synchronization / Catch-Up.
   */
  sync_state(target?: string): this {
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'SYNC',
      roomUri: this.tableUri,
      recipients: target ? [target] : '*',
      topic: 'session:sync',
      payload: { action: 'sync_state' },
      turn: '$context.turn',
      conversationId: this.tableUri,
    }));
    return this;
  }

  build(): CuratorSequentialNode {
    const name = this.tableUri.includes(':') ? this.tableUri : `game:${this.tableUri}`;
    return CuratorCoreBuilder.seq(name, ...this.steps);
  }
}

/**
 * Universal Interaction Builder Alias.
 * Polymorphic alias unifying tabletop games, speech acts, rituals, and theater.
 */
export const FluentInteractionBuilder = FluentGameBuilder;
export type FluentInteractionBuilder = FluentGameBuilder;
