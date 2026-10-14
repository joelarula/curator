import type { CuratorAstNode, CuratorSequentialNode } from '../../engine/CuratorAst.js';
import { CuratorCoreBuilder } from '../../engine/builder/CuratorCoreBuilder.js';

/**
 * Universal Game State Machine & Tabletop Fluent Builder.
 * Implements the 5 Foundational Game Phases:
 * 1. Contract Formation (The Ante / Initialization)
 * 2. State Inception (The Deal / Allocation & Information Partitioning)
 * 3. The Play Cycle (Interaction & Leverage: Wager, Contestation, Trick Execution)
 * 4. Showdown & Verification (Collapsing hidden state into truth)
 * 5. Settlement & Reallocation (Pot award, scoring, role rotation)
 */
export class FluentGameBuilder {
  private steps: CuratorAstNode[] = [];

  constructor(public tableUri: string) {}

  /**
   * Phase 1: The Ante / Contract Formation.
   * Commits baseline stakes or posts blinds.
   */
  ante(options: { amount?: number; pot?: number; blinds?: Record<string, number>; [k: string]: any } = {}): this {
    this.steps.push(CuratorCoreBuilder.setState({
      gamePhase: 'ANTE',
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

  /**
   * Phase 1B: Declaring Intent / Contracting (Bidding).
   * Bids for contract or trump suit (Bridge, Spades, Tarock).
   */
  bid(options: { as_role?: string; suit?: string; tricks?: number; amount?: number; [k: string]: any } = {}): this {
    this.steps.push(CuratorCoreBuilder.setState({
      gamePhase: 'CONTRACTING',
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

  /**
   * Phase 2: The Deal / State Inception.
   * Partitions private hole cards from shared public commons.
   */
  deal(options: { privateCount?: number; communityCount?: number; holeCards?: number; community?: number; [k: string]: any } = {}): this {
    const privCount = options.privateCount ?? options.holeCards ?? 0;
    const commCount = options.communityCount ?? options.community ?? 0;

    this.steps.push(CuratorCoreBuilder.setState({
      gamePhase: 'DEAL',
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

  /**
   * Phase 2B: Private Entitlement (Hidden State Allocation).
   * Deals cards privately to a specific player role so others cannot observe them.
   */
  deal_private(options: { to_role?: string; count?: number; cards?: any; [k: string]: any } = {}): this {
    const target = options.to_role || '$context.targetRole';
    this.steps.push(CuratorCoreBuilder.setState({
      gamePhase: 'DEAL',
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

  /**
   * Phase 2C: Public Commons (Shared Visible State Allocation).
   * Deals community cards or flips starter/trump card visible to all.
   */
  deal_public(options: { count?: number; cards?: any; starter?: string; [k: string]: any } = {}): this {
    this.steps.push(CuratorCoreBuilder.setState({
      gamePhase: 'DEAL',
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

  /**
   * Phase 3A: Resource Acquisition / Discard.
   * Hit / Draw card to manage entropy and optimize private state.
   */
  hit(options: { as_role?: string; count?: number; [k: string]: any } = {}): this {
    return this.draw({ count: 1, ...options, action: 'hit' });
  }

  draw(options: { as_role?: string; count?: number; from?: 'deck' | 'discard'; [k: string]: any } = {}): this {
    const act = options.action || 'draw';
    this.steps.push(CuratorCoreBuilder.setState({
      gamePhase: 'INTERACTION',
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
    this.steps.push(CuratorCoreBuilder.setState({
      gamePhase: 'INTERACTION',
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

  /**
   * Phase 3B: Valuation & Posturing (The Wager / Claim).
   * Proposes a bet, raise, or card rank claim.
   */
  wager(options: { action?: 'bet' | 'raise' | 'check'; amount?: number; as_role?: string; [k: string]: any } = {}): this {
    const act = options.action || 'bet';
    this.steps.push(CuratorCoreBuilder.setState({
      gamePhase: 'WAGER',
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

  /**
   * Posturing / Claim: Asserts private state or bluff (Cheat, Liar's Dice, Perudo).
   */
  claim(options: { as_role?: string; declaration: string; rank?: string; count?: number; cards?: any; [k: string]: any }): this {
    this.steps.push(CuratorCoreBuilder.setState({
      gamePhase: 'POSTURING',
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
   * Phase 3C: Contestation & Response (The Challenge / Yield).
   * Accepts valuation (call/stand), folds, or issues an empirical challenge (Cheat/Bullshit).
   */
  contestation(options: { action?: 'call' | 'fold' | 'stand' | 'challenge' | 'double_down'; as_role?: string; timeout?: string | number; [k: string]: any } = {}): this {
    const act = options.action || 'call';
    this.steps.push(CuratorCoreBuilder.setState({
      gamePhase: 'CONTESTATION',
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

  stand(options: { as_role?: string; [k: string]: any } = {}): this {
    return this.contestation({ action: 'stand', ...options });
  }

  fold(options: { as_role?: string; [k: string]: any } = {}): this {
    return this.contestation({ action: 'fold', ...options });
  }

  call(options: { as_role?: string; amount?: number; [k: string]: any } = {}): this {
    return this.contestation({ action: 'call', ...options });
  }

  challenge(options: { as_role?: string; target_role?: string; [k: string]: any } = {}): this {
    return this.contestation({ action: 'challenge', ...options });
  }

  /**
   * Phase 3D: Execution & Capture (The Trick / Round Resolution).
   * Plays a card to lead or follow a trick (Hearts, Spades, Bridge, War).
   */
  lead(options: { as_role?: string; card?: any; suit?: string; rank?: any; [k: string]: any }): this {
    return this.play_card({ action: 'lead', ...options });
  }

  play_card(options: { as_role?: string; card?: any; suit?: string; rank?: any; [k: string]: any }): this {
    const act = options.action || 'play';
    this.steps.push(CuratorCoreBuilder.setState({
      gamePhase: 'EXECUTION',
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
    this.steps.push(CuratorCoreBuilder.setState({
      gamePhase: 'EXECUTION',
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

  /**
   * Advances the street (Flop, Turn, River) in poker-like games.
   */
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

  /**
   * Phase 4: The Showdown / Reveal (Verification).
   * Tables private hands to public domain and adjudicates claims against truth.
   */
  showdown(options: { evaluator?: string; revealAll?: boolean; [k: string]: any } = {}): this {
    this.steps.push(CuratorCoreBuilder.setState({
      gamePhase: 'SHOWDOWN',
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
   * Phase 5: Settlement / Reallocation (State Reset).
   * Payouts pot, checks for player elimination, and rotates positional advantage (dealer button).
   */
  settlement(options: { winner?: string; pot?: number; points?: Record<string, number>; rotateDealer?: boolean; [k: string]: any } = {}): this {
    this.steps.push(CuratorCoreBuilder.setState({
      gamePhase: 'SETTLEMENT',
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
    this.steps.push(CuratorCoreBuilder.setState({
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

  build(): CuratorSequentialNode {
    return CuratorCoreBuilder.seq(`game:${this.tableUri}`, ...this.steps);
  }
}
