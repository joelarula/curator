import type { CuratorSequentialNode } from '../../engine/CuratorAst.js';
import { CuratorCoreBuilder } from '../../engine/builder/CuratorCoreBuilder.js';
import { vocabularyRegistry } from '../../engine/builder/VocabularyRegistry.js';
import { FluentGameBuilder, FluentInteractionBuilder } from './FluentGameBuilder.js';

// ============================================================================
// Top-Level Factory Constructors
// ============================================================================

export function game(tableUri: string): FluentGameBuilder {
  return new FluentGameBuilder(tableUri);
}

export function table(tableUri: string): FluentGameBuilder {
  return new FluentGameBuilder(tableUri);
}

export function interaction(uri: string): FluentGameBuilder {
  return new FluentGameBuilder(uri.startsWith('interaction:') ? uri : `interaction:${uri}`);
}

export function ritual(uri: string): FluentGameBuilder {
  return new FluentGameBuilder(uri.startsWith('ritual:') ? uri : `ritual:${uri}`);
}

export function theater(uri: string): FluentGameBuilder {
  return new FluentGameBuilder(uri.startsWith('theater:') ? uri : `theater:${uri}`);
}

export function protocol(uri: string): FluentGameBuilder {
  return new FluentGameBuilder(uri.startsWith('protocol:') ? uri : `protocol:${uri}`);
}

// ============================================================================
// 1. Frame & Boundary (The Container)
// ============================================================================

export function bracket(options: {
  container?: string;
  frame?: string;
  ruleset?: string;
  duration?: string | number;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.container || options.table || '$context.tableUri || "container"';
  return CuratorCoreBuilder.seq(
    `bracket:${t}`,
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'FRAME_BOUNDARY',
      interactionPhase: 'BRACKET',
      magicCircle: true,
      frame: options.frame || 'magic_circle',
      ruleset: options.ruleset || 'default',
      containerUri: t,
      turn: '$context.turn + 1',
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'REQUEST',
      roomUri: t,
      topic: 'interaction:bracket',
      payload: { action: 'bracket', container: t, ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export const magic_circle = bracket;

export function stance(
  alignmentOrOptions: string | { alignment: string; as_role?: string; table?: string; [k: string]: any },
  options: { as_role?: string; table?: string; [k: string]: any } = {}
): CuratorSequentialNode {
  const alignment = typeof alignmentOrOptions === 'string'
    ? alignmentOrOptions
    : (alignmentOrOptions.alignment || 'transactional');
  const extra = typeof alignmentOrOptions === 'object' ? alignmentOrOptions : options;
  const t = extra.table || options.table || '$context.tableUri || "container"';
  const senderRole = extra.as_role || options.as_role || '$context.senderRole';

  return CuratorCoreBuilder.seq(
    `stance:${alignment}`,
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'FRAME_BOUNDARY',
      interactionPhase: 'STANCE',
      stance: alignment,
      frameAlignment: alignment,
      turn: '$context.turn + 1',
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'INFORM',
      roomUri: t,
      senderRole,
      topic: 'interaction:stance',
      payload: { action: 'stance', alignment, ...extra },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export const frame_alignment = stance;

export function stake(options: {
  amount?: number;
  collateralType?: 'material' | 'social_face' | 'emotional_vulnerability' | 'sacred_pledge';
  collateral?: any;
  blinds?: Record<string, number>;
  pot?: number;
  as_role?: string;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  const collType = options.collateralType || 'material';
  const amountVal = options.amount ?? options.pot ?? 0;

  return CuratorCoreBuilder.seq(
    `stake:${amountVal || collType}`,
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'FRAME_BOUNDARY',
      interactionPhase: 'STAKE',
      turn: '$context.turn + 1',
      stake: amountVal || options.collateral || 0,
      collateralType: collType,
      pot: amountVal,
      blinds: options.blinds || null,
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'REQUEST',
      roomUri: t,
      senderRole: options.as_role || '$context.senderRole',
      topic: 'interaction:stake',
      payload: { action: 'stake', collateralType: collType, ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export const buy_in = stake;

export function ante(options: {
  amount?: number;
  pot?: number;
  blinds?: Record<string, number>;
  table?: string;
  [k: string]: any;
}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "table"';
  return CuratorCoreBuilder.seq(
    `ante:${options.amount || options.pot || 0}`,
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'FRAME_BOUNDARY',
      gamePhase: 'ANTE',
      turn: '$context.turn + 1',
      pot: options.pot || options.amount || 0,
      blinds: options.blinds || null,
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'REQUEST',
      roomUri: t,
      topic: 'game:ante',
      payload: options,
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

// ============================================================================
// 2. Posturing & Assertion (Claiming Reality)
// ============================================================================

export function bid(options: {
  as_role?: string;
  suit?: string;
  tricks?: number;
  amount?: number;
  table?: string;
  [k: string]: any;
}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "table"';
  return CuratorCoreBuilder.seq(
    `bid:${options.as_role || 'role'}`,
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'POSTURING_ASSERTION',
      gamePhase: 'CONTRACTING',
      turn: '$context.turn + 1',
      lastBid: options,
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'PROPOSE',
      roomUri: t,
      senderRole: options.as_role || '$context.senderRole',
      topic: 'game:bid',
      payload: { action: 'bid', ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export function gambit(options: {
  as_role?: string;
  move?: string;
  trajectory?: string;
  proposal?: any;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  return CuratorCoreBuilder.seq(
    `gambit:${options.move || options.as_role || 'gambit'}`,
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'POSTURING_ASSERTION',
      interactionAct: 'gambit',
      turn: '$context.turn + 1',
      lastGambit: options,
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'PROPOSE',
      roomUri: t,
      senderRole: options.as_role || '$context.senderRole',
      topic: 'interaction:gambit',
      payload: { action: 'gambit', ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export function posture(options: {
  as_role?: string;
  signalType?: 'costly' | 'cheap_talk' | 'bluff';
  claim?: string;
  declaration?: string;
  authority?: string;
  table?: string;
  [k: string]: any;
}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  return CuratorCoreBuilder.seq(
    `posture:${options.signalType || options.claim || options.declaration || 'signal'}`,
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'POSTURING_ASSERTION',
      interactionAct: 'posture',
      turn: '$context.turn + 1',
      lastPosture: options,
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'ASSERT',
      roomUri: t,
      senderRole: options.as_role || '$context.senderRole',
      topic: 'interaction:posture',
      payload: { action: 'posture', ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export const signal = posture;

export function raise(options: {
  as_role?: string;
  amount?: number;
  friction?: string;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  const amountVal = options.amount || 0;
  return CuratorCoreBuilder.seq(
    `raise:${amountVal || options.friction || 'escalate'}`,
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'POSTURING_ASSERTION',
      interactionAct: 'raise',
      turn: '$context.turn + 1',
      currentWager: amountVal,
      pot: amountVal ? `$context.pot + ${amountVal}` : '$context.pot',
      lastEscalation: options,
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'PROPOSE',
      roomUri: t,
      senderRole: options.as_role || '$context.senderRole',
      topic: 'wager:raise',
      payload: { action: 'raise', amount: amountVal, ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export const escalate = raise;

export function claim(options: {
  as_role?: string;
  declaration: string;
  rank?: string;
  count?: number;
  cards?: any;
  table?: string;
  [k: string]: any;
}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "table"';
  return CuratorCoreBuilder.seq(
    `claim:${options.declaration}`,
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'POSTURING_ASSERTION',
      gamePhase: 'POSTURING',
      microTurn: 'CLAIM',
      turn: '$context.turn + 1',
      lastClaim: options,
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'ASSERT',
      roomUri: t,
      senderRole: options.as_role || '$context.senderRole',
      topic: 'game:claim',
      payload: { action: 'claim', ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export function wager(options: {
  action?: 'bet' | 'raise' | 'check';
  amount?: number;
  as_role?: string;
  table?: string;
  [k: string]: any;
}): CuratorSequentialNode {
  const act = options.action || 'bet';
  const t = options.table || '$context.tableUri || "table"';

  return CuratorCoreBuilder.seq(
    `wager:${act}:${options.amount || 0}`,
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'POSTURING_ASSERTION',
      gamePhase: 'WAGER',
      microTurn: 'VALUATION',
      turn: '$context.turn + 1',
      currentWager: options.amount || 0,
      pot: `$context.pot + ${options.amount || 0}`,
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'PROPOSE',
      roomUri: t,
      senderRole: options.as_role || '$context.senderRole',
      topic: `wager:${act}`,
      payload: { action: act, amount: options.amount, ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

// ============================================================================
// Tabletop Allocation & Play Cycle Composables
// ============================================================================

export function deal(options: {
  privateCount?: number;
  communityCount?: number;
  holeCards?: number;
  community?: number;
  table?: string;
  [k: string]: any;
}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "table"';
  const privCount = options.privateCount ?? options.holeCards ?? 0;
  const commCount = options.communityCount ?? options.community ?? 0;

  return CuratorCoreBuilder.seq(
    `deal:p${privCount}_c${commCount}`,
    CuratorCoreBuilder.setState({
      gamePhase: 'DEAL',
      turn: '$context.turn + 1',
      privateCardCount: privCount,
      communityCardCount: commCount,
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'INFORM',
      roomUri: t,
      topic: 'game:deal',
      payload: { privateCount: privCount, communityCount: commCount, ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export function deal_private(options: {
  to_role?: string;
  count?: number;
  cards?: any;
  table?: string;
  [k: string]: any;
}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "table"';
  const target = options.to_role || '$context.targetRole';
  return CuratorCoreBuilder.seq(
    `deal_private:${target}`,
    CuratorCoreBuilder.setState({
      gamePhase: 'DEAL',
      turn: '$context.turn + 1',
      [`private_hand_${target}`]: options.cards || options.count || 2,
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'dialog',
      speechAct: 'INFORM',
      roomUri: t,
      targetRole: target,
      topic: 'game:deal:private',
      payload: { action: 'deal_private', count: options.count || 2, cards: options.cards, ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export function deal_public(options: {
  count?: number;
  cards?: any;
  starter?: string;
  table?: string;
  [k: string]: any;
}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "table"';
  return CuratorCoreBuilder.seq(
    'deal_public',
    CuratorCoreBuilder.setState({
      gamePhase: 'DEAL',
      turn: '$context.turn + 1',
      communityCards: options.cards || options.count || 3,
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'INFORM',
      roomUri: t,
      topic: 'game:deal:public',
      payload: { action: 'deal_public', ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export function draw(options: {
  as_role?: string;
  count?: number;
  from?: 'deck' | 'discard';
  table?: string;
  [k: string]: any;
}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "table"';
  const act = options.action || 'draw';
  return CuratorCoreBuilder.seq(
    `resource:${act}:${options.as_role || 'role'}`,
    CuratorCoreBuilder.setState({
      gamePhase: 'INTERACTION',
      microTurn: 'ACQUISITION',
      turn: '$context.turn + 1',
      lastAcquisition: act,
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'REQUEST',
      roomUri: t,
      senderRole: options.as_role || '$context.senderRole',
      topic: `resource:${act}`,
      payload: { action: act, count: options.count || 1, from: options.from || 'deck', ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export function hit(options: {
  as_role?: string;
  count?: number;
  table?: string;
  [k: string]: any;
}): CuratorSequentialNode {
  return draw({ count: 1, ...options, action: 'hit' });
}

export function discard(options: {
  as_role?: string;
  cards?: any;
  count?: number;
  table?: string;
  [k: string]: any;
}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "table"';
  return CuratorCoreBuilder.seq(
    `resource:discard:${options.as_role || 'role'}`,
    CuratorCoreBuilder.setState({
      gamePhase: 'INTERACTION',
      microTurn: 'DISCARD',
      turn: '$context.turn + 1',
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'INFORM',
      roomUri: t,
      senderRole: options.as_role || '$context.senderRole',
      topic: 'resource:discard',
      payload: { action: 'discard', ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export function swap(options: {
  as_role?: string;
  discard?: any;
  drawCount?: number;
  table?: string;
  [k: string]: any;
}): CuratorSequentialNode {
  const d = discard({ as_role: options.as_role, cards: options.discard, table: options.table });
  const w = draw({ as_role: options.as_role, count: options.drawCount || 1, table: options.table });
  return CuratorCoreBuilder.seq(`swap:${options.as_role || 'role'}`, d, w);
}

export function lead(options: {
  as_role?: string;
  card?: any;
  suit?: string;
  rank?: any;
  table?: string;
  [k: string]: any;
}): CuratorSequentialNode {
  return play_card({ action: 'lead', ...options });
}

export function play_card(options: {
  as_role?: string;
  card?: any;
  suit?: string;
  rank?: any;
  table?: string;
  [k: string]: any;
}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "table"';
  const act = options.action || 'play';
  return CuratorCoreBuilder.seq(
    `trick:play:${options.as_role || 'role'}`,
    CuratorCoreBuilder.setState({
      gamePhase: 'EXECUTION',
      microTurn: 'PLAY',
      turn: '$context.turn + 1',
      lastCardPlayed: options.card || options,
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'INFORM',
      roomUri: t,
      senderRole: options.as_role || '$context.senderRole',
      topic: 'trick:play',
      payload: { action: act, ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export function capture(options: {
  winner_role?: string;
  trickId?: string;
  cards?: any[];
  points?: number;
  table?: string;
  [k: string]: any;
}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "table"';
  return CuratorCoreBuilder.seq(
    `trick:capture:${options.winner_role || 'winner'}`,
    CuratorCoreBuilder.setState({
      gamePhase: 'EXECUTION',
      microTurn: 'CAPTURE',
      turn: '$context.turn + 1',
      lastTrickWinner: options.winner_role || '$context.trickWinner',
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'INFORM',
      roomUri: t,
      topic: 'trick:capture',
      payload: { action: 'capture', ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

// ============================================================================
// 3. Yielding & Contestation (Managing Collision)
// ============================================================================

export function check(options: {
  as_role?: string;
  note?: string;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  return CuratorCoreBuilder.seq(
    `check:${options.as_role || 'role'}`,
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'YIELDING_CONTESTATION',
      interactionAct: 'check',
      turn: '$context.turn + 1',
      initiativePassed: true,
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'ACCEPT',
      roomUri: t,
      senderRole: options.as_role || '$context.senderRole',
      topic: 'contestation:check',
      payload: { action: 'check', ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export function defer(options: {
  as_role?: string;
  to_role?: string;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  return CuratorCoreBuilder.seq(
    `defer:${options.to_role || 'next'}`,
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'YIELDING_CONTESTATION',
      interactionAct: 'defer',
      turn: '$context.turn + 1',
      deferredTo: options.to_role,
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'ACCEPT',
      roomUri: t,
      senderRole: options.as_role || '$context.senderRole',
      topic: 'contestation:defer',
      payload: { action: 'defer', ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export function challenge(options: {
  as_role?: string;
  target_role?: string;
  interrogation?: string;
  basis?: string;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "table"';
  return CuratorCoreBuilder.seq(
    `challenge:${options.as_role || 'challenger'}`,
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'YIELDING_CONTESTATION',
      gamePhase: 'CONTESTATION',
      microTurn: 'RESPONSE',
      turn: '$context.turn + 1',
      lastContestation: 'challenge',
      lastChallenge: options,
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'VOTE',
      roomUri: t,
      senderRole: options.as_role || '$context.senderRole',
      topic: 'contestation:challenge',
      payload: { action: 'challenge', ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export const interrogate = challenge;

export function concede(options: {
  as_role?: string;
  concession?: string;
  reason?: string;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  return CuratorCoreBuilder.seq(
    `yield:${options.as_role || 'role'}`,
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'YIELDING_CONTESTATION',
      interactionAct: 'yield',
      turn: '$context.turn + 1',
      lastConcession: options,
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'REJECT',
      roomUri: t,
      senderRole: options.as_role || '$context.senderRole',
      topic: 'contestation:yield',
      payload: { action: 'yield', ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export const yield_turn = concede;
export { concede as yield };

export function stand(options: {
  as_role?: string;
  table?: string;
  [k: string]: any;
}): CuratorSequentialNode {
  return contestation({ action: 'stand', ...options });
}

export function fold(options: {
  as_role?: string;
  table?: string;
  [k: string]: any;
}): CuratorSequentialNode {
  return contestation({ action: 'fold', ...options });
}

export function call(options: {
  as_role?: string;
  amount?: number;
  table?: string;
  [k: string]: any;
}): CuratorSequentialNode {
  return contestation({ action: 'call', ...options });
}

export function contestation(options: {
  action?: 'call' | 'fold' | 'stand' | 'challenge' | 'double_down';
  as_role?: string;
  table?: string;
  [k: string]: any;
}): CuratorSequentialNode {
  const act = options.action || 'call';
  const t = options.table || '$context.tableUri || "table"';

  return CuratorCoreBuilder.seq(
    `contestation:${act}`,
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'YIELDING_CONTESTATION',
      gamePhase: 'CONTESTATION',
      microTurn: 'RESPONSE',
      turn: '$context.turn + 1',
      lastContestation: act,
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: act === 'fold' ? 'REJECT' : (act === 'challenge' ? 'VOTE' : 'ACCEPT'),
      roomUri: t,
      senderRole: options.as_role || '$context.senderRole',
      topic: `contestation:${act}`,
      payload: { action: act, ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

// ============================================================================
// 4. Verification & Revelation (Collapsing Entropy)
// ============================================================================

export function expose(options: {
  as_role?: string;
  evidence?: any;
  cards?: any;
  revealAll?: boolean;
  evaluator?: string;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  return CuratorCoreBuilder.seq(
    'expose',
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'VERIFICATION_REVELATION',
      gamePhase: 'SHOWDOWN',
      turn: '$context.turn + 1',
      showdownStatus: 'VERIFYING',
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'SYNTHESIZE',
      roomUri: t,
      senderRole: options.as_role || '$context.senderRole',
      topic: 'interaction:expose',
      payload: {
        action: 'expose',
        evaluator: options.evaluator || 'standard_rules',
        revealAll: options.revealAll ?? true,
        ...options,
      },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export function showdown(options: {
  evaluator?: string;
  revealAll?: boolean;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "table"';
  return CuratorCoreBuilder.seq(
    'showdown',
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'VERIFICATION_REVELATION',
      gamePhase: 'SHOWDOWN',
      turn: '$context.turn + 1',
      showdownStatus: 'VERIFYING',
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'SYNTHESIZE',
      roomUri: t,
      topic: 'game:showdown',
      payload: options,
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export function reveal(options: {
  as_role?: string;
  cards?: any;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "table"';
  return CuratorCoreBuilder.seq(
    `reveal:${options.as_role || 'role'}`,
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'INFORM',
      roomUri: t,
      senderRole: options.as_role || '$context.senderRole',
      topic: 'game:reveal',
      payload: { action: 'reveal', ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export function ratify(options: {
  as_role?: string;
  witnesses?: string[];
  verdict?: string;
  covenant?: any;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  return CuratorCoreBuilder.seq(
    `ratify:${options.verdict || 'ratified'}`,
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'VERIFICATION_REVELATION',
      interactionAct: 'ratify',
      turn: '$context.turn + 1',
      ratificationStatus: 'RATIFIED',
      verdict: options.verdict || '$context.declaredVerdict',
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'SYNTHESIZE',
      roomUri: t,
      senderRole: options.as_role || '$context.senderRole',
      topic: 'interaction:ratify',
      payload: { action: 'ratify', ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export const witness = ratify;

// ============================================================================
// 5. Settlement & Accounting (State Rebalance)
// ============================================================================

export function levy(options: {
  target_role?: string;
  as_role?: string;
  amount?: number;
  currency?: string;
  penalty?: string;
  faceLoss?: number;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  return CuratorCoreBuilder.seq(
    `levy:${options.target_role || 'target'}`,
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'SETTLEMENT_ACCOUNTING',
      interactionAct: 'levy',
      turn: '$context.turn + 1',
      lastLevy: options,
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'INFORM',
      roomUri: t,
      senderRole: options.as_role || '$context.senderRole',
      topic: 'interaction:levy',
      payload: { action: 'levy', ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export const toll = levy;

export function clear(options: {
  as_role?: string;
  scope?: string;
  resetSlate?: boolean;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  return CuratorCoreBuilder.seq(
    'clear',
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'SETTLEMENT_ACCOUNTING',
      interactionAct: 'clear',
      turn: '$context.turn + 1',
      slateStatus: 'CLEARED',
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'INFORM',
      roomUri: t,
      senderRole: options.as_role || '$context.senderRole',
      topic: 'interaction:clear',
      payload: { action: 'clear', ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export const reset = clear;

export function settlement(options: {
  winner?: string;
  rotateDealer?: boolean;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "table"';
  return CuratorCoreBuilder.seq(
    'settlement',
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'SETTLEMENT_ACCOUNTING',
      gamePhase: 'SETTLEMENT',
      turn: '$context.turn + 1',
      roundStatus: 'CONCLUDED',
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'INFORM',
      roomUri: t,
      topic: 'game:settlement',
      payload: options,
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export function rotate_dealer(options: {
  next_role?: string;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "table"';
  return CuratorCoreBuilder.seq(
    'rotate_dealer',
    CuratorCoreBuilder.setState({
      turn: '$context.turn + 1',
      dealer: options.next_role || '$context.nextDealer',
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'INFORM',
      roomUri: t,
      topic: 'game:rotate_dealer',
      payload: { action: 'rotate_dealer', ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

// ============================================================================
// 6. Meta-Acts (Rules of the Rule-Set)
// ============================================================================

export function repair(options: {
  as_role?: string;
  adjustment?: string;
  correction?: string;
  apology?: string;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  return CuratorCoreBuilder.seq(
    'repair',
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'META_ACTS',
      interactionAct: 'repair',
      turn: '$context.turn + 1',
      lastRepair: options,
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'REQUEST',
      roomUri: t,
      senderRole: options.as_role || '$context.senderRole',
      topic: 'interaction:repair',
      payload: { action: 'repair', ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export function rupture(options: {
  as_role?: string;
  breachType?: 'spoilsport' | 'walkout' | 'table_flip' | 'heresy' | 'contempt';
  reason?: string;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  return CuratorCoreBuilder.seq(
    'rupture',
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'META_ACTS',
      interactionAct: 'rupture',
      turn: '$context.turn + 1',
      ruptureStatus: 'FRAME_BROKEN',
      lastRupture: options,
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'REJECT',
      roomUri: t,
      senderRole: options.as_role || '$context.senderRole',
      topic: 'interaction:rupture',
      payload: { action: 'rupture', ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

// ============================================================================
// Vocabularies Registration
// ============================================================================

export const interactionVocabularies = {
  // Factories
  game,
  table,
  interaction,
  ritual,
  theater,
  protocol,

  // 1. Frame & Boundary
  bracket,
  magic_circle,
  stance,
  frame_alignment,
  stake,
  buy_in,
  ante,

  // 2. Posturing & Assertion
  bid,
  gambit,
  posture,
  signal,
  raise,
  escalate,
  wager,
  claim,
  deal,
  deal_private,
  deal_public,
  draw,
  hit,
  discard,
  swap,
  lead,
  play_card,
  capture,

  // 3. Yielding & Contestation
  check,
  defer,
  challenge,
  interrogate,
  yield: concede,
  concede,
  yield_turn,
  stand,
  fold,
  call,
  contestation,

  // 4. Verification & Revelation
  expose,
  showdown,
  reveal,
  ratify,
  witness,

  // 5. Settlement & Accounting
  levy,
  toll,
  clear,
  reset,
  settlement,
  rotate_dealer,

  // 6. Meta-Acts
  repair,
  rupture,
};

export const tabletopVocabularies = interactionVocabularies;

// Automatically register interaction verbs into vocabulary registry
vocabularyRegistry.registerMany(interactionVocabularies);
