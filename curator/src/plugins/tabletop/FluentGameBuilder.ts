import type { CuratorAstNode, CuratorSequentialNode } from '../../engine/CuratorAst.js';
import { CuratorCoreBuilder } from '../../engine/builder/CuratorCoreBuilder.js';
import {
  UNIVERSAL_GAME_PHASE_MATRIX,
  UNIVERSAL_INTERACTION_MATRIX,
  type UniversalInteractionPrimitive,
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
  private steps: CuratorAstNode[] = [];

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
  // BUILD
  // ==========================================================================

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
