import type { CuratorSequentialNode } from '../../engine/CuratorAst.js';
import { CuratorCoreBuilder } from '../../engine/builder/CuratorCoreBuilder.js';
import { vocabularyRegistry } from '../../engine/builder/VocabularyRegistry.js';
import { FluentGameBuilder, FluentInteractionBuilder } from './FluentGameBuilder.js';
import { FluentTricksterBuilder } from './FluentTricksterBuilder.js';
import type { AmbientSpeechActOptions } from './matrix.js';

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

export function trickster(containerOrRole = 'trickster', roleOrContainer?: string): FluentTricksterBuilder {
  let container: string;
  let role: string;

  if (roleOrContainer) {
    container = containerOrRole;
    role = roleOrContainer;
  } else {
    container = containerOrRole.includes(':') ? containerOrRole : `interaction:${containerOrRole}`;
    role = 'trickster';
  }
  return new FluentTricksterBuilder(container, role);
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
// 7. Trickster Meta-Operations (Frame Subversion & Semiotic Sabotage)
// ============================================================================

export function hijack_frame(options: {
  newFrame?: string;
  targetFrame?: string;
  smuggledStakes?: any;
  slapstick?: boolean;
  as_role?: string;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  const role = options.as_role || '$context.senderRole';
  return CuratorCoreBuilder.seq(
    `hijack_frame:${role}`,
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'FRAME_BOUNDARY',
      tricksterAction: 'FRAME_HIJACK',
      frameHijacked: true,
      frame: options.newFrame || 'subverted_frame',
      smuggledStakes: options.smuggledStakes || null,
      turn: '$context.turn + 1',
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'PROPOSE',
      roomUri: t,
      senderRole: role,
      topic: 'trickster:hijack_frame',
      payload: { action: 'hijack_frame', actor: role, ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export function feign_stance(options: {
  apparentStance?: string;
  target?: string;
  pietyLevel?: string;
  innerIntent?: string;
  as_role?: string;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  const role = options.as_role || '$context.senderRole';
  const apparent = options.apparentStance || 'pious_innocence';
  return CuratorCoreBuilder.seq(
    `feign_stance:${role}`,
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'FRAME_BOUNDARY',
      tricksterAction: 'PERVERSE_STANCE',
      apparentStance: apparent,
      innerIntent: options.innerIntent || 'subversive_critique',
      turn: '$context.turn + 1',
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'INFORM',
      roomUri: t,
      senderRole: role,
      topic: 'trickster:feign_stance',
      payload: { action: 'feign_stance', actor: role, apparentStance: apparent, ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export const perverse_stance = feign_stance;

export function asymmetric_buy_in(options: {
  target_role?: string;
  opponentStake?: any;
  selfStake?: any;
  bait?: string;
  as_role?: string;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  const role = options.as_role || '$context.senderRole';
  return CuratorCoreBuilder.seq(
    `asymmetric_buy_in:${role}`,
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'FRAME_BOUNDARY',
      tricksterAction: 'ASYMMETRIC_BUY_IN',
      opponentStake: options.opponentStake,
      selfStake: options.selfStake ?? 0,
      turn: '$context.turn + 1',
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'REQUEST',
      roomUri: t,
      senderRole: role,
      topic: 'trickster:asymmetric_buy_in',
      payload: { action: 'asymmetric_buy_in', actor: role, ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export function hyper_comply(options: {
  ruleOrCommand?: string;
  command?: string;
  literalInterpretation?: string;
  extremeResult?: any;
  exposedAssumption?: string;
  as_role?: string;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  const role = options.as_role || '$context.senderRole';
  const literal = options.literalInterpretation || options.command || options.ruleOrCommand || 'literal_code';
  return CuratorCoreBuilder.seq(
    `hyper_comply:${role}`,
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'POSTURING_ASSERTION',
      tricksterAction: 'MALICIOUS_HYPER_COMPLIANCE',
      literalInterpretation: literal,
      extremeResult: options.extremeResult,
      exposedAssumption: options.exposedAssumption,
      turn: '$context.turn + 1',
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'ASSERT',
      roomUri: t,
      senderRole: role,
      topic: 'trickster:hyper_comply',
      payload: { action: 'hyper_comply', actor: role, literalInterpretation: literal, ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export const literal_gambit = hyper_comply;

export function counterfeit_signal(options: {
  mimickedSignal?: string;
  projectedPosture?: string;
  apparentCost?: any;
  actualCost?: number;
  targetBelief?: string;
  as_role?: string;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  const role = options.as_role || '$context.senderRole';
  return CuratorCoreBuilder.seq(
    `counterfeit_signal:${role}`,
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'POSTURING_ASSERTION',
      tricksterAction: 'COUNTERFEIT_SIGNAL',
      mimickedSignal: options.mimickedSignal || options.projectedPosture,
      actualCost: options.actualCost ?? 0,
      turn: '$context.turn + 1',
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'ASSERT',
      roomUri: t,
      senderRole: role,
      topic: 'trickster:counterfeit_signal',
      payload: { action: 'counterfeit_signal', actor: role, ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export function bait_escalation(options: {
  target_role?: string;
  baitTarget?: 'vanity' | 'greed' | 'righteousness' | 'fear';
  provocation?: string;
  expectedEscalation?: any;
  as_role?: string;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  const role = options.as_role || '$context.senderRole';
  return CuratorCoreBuilder.seq(
    `bait_escalation:${role}`,
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'POSTURING_ASSERTION',
      tricksterAction: 'BAITING_ESCALATION',
      targetVulnerability: options.baitTarget || 'vanity',
      turn: '$context.turn + 1',
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'PROPOSE',
      roomUri: t,
      senderRole: role,
      topic: 'trickster:bait_escalation',
      payload: { action: 'bait_escalation', actor: role, ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export function deflect_challenge(options: {
  challenger?: string;
  redefinition?: string;
  pivotFrame?: string;
  deflectionReason?: string;
  as_role?: string;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  const role = options.as_role || '$context.senderRole';
  return CuratorCoreBuilder.seq(
    `deflect_challenge:${role}`,
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'YIELDING_CONTESTATION',
      tricksterAction: 'DEFLECT_CHALLENGE',
      redefinition: options.redefinition,
      challengeDeflected: true,
      turn: '$context.turn + 1',
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'ASSERT',
      roomUri: t,
      senderRole: role,
      topic: 'trickster:deflect_challenge',
      payload: { action: 'deflect_challenge', actor: role, ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export function parody_yield(options: {
  theatrics?: string;
  feignedProstration?: boolean;
  hiddenMotive?: string;
  as_role?: string;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  const role = options.as_role || '$context.senderRole';
  return CuratorCoreBuilder.seq(
    `parody_yield:${role}`,
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'YIELDING_CONTESTATION',
      tricksterAction: 'PARODY_YIELD',
      feignedSubmission: true,
      hiddenMotive: options.hiddenMotive || 'disarm_vengeance',
      turn: '$context.turn + 1',
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'REJECT',
      roomUri: t,
      senderRole: role,
      topic: 'trickster:parody_yield',
      payload: { action: 'parody_yield', actor: role, ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export const feigned_prostration = parody_yield;

export function ungraspable_check(options: {
  riddle?: string;
  evasion?: string;
  as_role?: string;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  const role = options.as_role || '$context.senderRole';
  return CuratorCoreBuilder.seq(
    `ungraspable_check:${role}`,
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'YIELDING_CONTESTATION',
      tricksterAction: 'UNGRASPABLE_CHECK',
      feedbackLoopStarved: true,
      riddle: options.riddle,
      turn: '$context.turn + 1',
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'ACCEPT',
      roomUri: t,
      senderRole: role,
      topic: 'trickster:ungraspable_check',
      payload: { action: 'ungraspable_check', actor: role, ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export function staged_expose(options: {
  exposedRole?: string;
  targetHypocrisy?: string;
  evidence?: any;
  escapeRoute?: string;
  as_role?: string;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  const role = options.as_role || '$context.senderRole';
  return CuratorCoreBuilder.seq(
    `staged_expose:${role}`,
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'VERIFICATION_REVELATION',
      tricksterAction: 'STAGED_EXPOSE',
      exposedHypocrite: options.exposedRole,
      ambushStaged: true,
      turn: '$context.turn + 1',
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'SYNTHESIZE',
      roomUri: t,
      senderRole: role,
      topic: 'trickster:staged_expose',
      payload: { action: 'staged_expose', actor: role, ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export const ambush_showdown = staged_expose;

export function refuse_ratification(options: {
  dismissalReason?: string;
  partingMockery?: string;
  deniedClosure?: boolean;
  as_role?: string;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  const role = options.as_role || '$context.senderRole';
  return CuratorCoreBuilder.seq(
    `refuse_ratification:${role}`,
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'VERIFICATION_REVELATION',
      tricksterAction: 'REFUSE_RATIFICATION',
      moralWeightRejected: true,
      closureDenied: true,
      turn: '$context.turn + 1',
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'REJECT',
      roomUri: t,
      senderRole: role,
      topic: 'trickster:refuse_ratification',
      payload: { action: 'refuse_ratification', actor: role, ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export function evade_toll(options: {
  penaltyEvaded?: any;
  reinterpretation?: string;
  stageTurned?: boolean;
  as_role?: string;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  const role = options.as_role || '$context.senderRole';
  return CuratorCoreBuilder.seq(
    `evade_toll:${role}`,
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'SETTLEMENT_ACCOUNTING',
      tricksterAction: 'TOLL_EVASION',
      tollPaid: false,
      cageTurnedToStage: options.stageTurned ?? true,
      turn: '$context.turn + 1',
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'INFORM',
      roomUri: t,
      senderRole: role,
      topic: 'trickster:evade_toll',
      payload: { action: 'evade_toll', actor: role, ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export function invert_value(options: {
  originalCurrency?: string;
  invertedValue?: string;
  absurdityRatio?: any;
  as_role?: string;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  const role = options.as_role || '$context.senderRole';
  return CuratorCoreBuilder.seq(
    `invert_value:${role}`,
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'SETTLEMENT_ACCOUNTING',
      tricksterAction: 'VALUE_INVERSION',
      currencyDisrupted: true,
      goldToLeaves: true,
      turn: '$context.turn + 1',
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'INFORM',
      roomUri: t,
      senderRole: role,
      topic: 'trickster:invert_value',
      payload: { action: 'invert_value', actor: role, ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export function creative_rupture(options: {
  revelation?: string;
  shatteredIllusion?: string;
  as_role?: string;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  const role = options.as_role || '$context.senderRole';
  return CuratorCoreBuilder.seq(
    `creative_rupture:${role}`,
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'META_ACTS',
      tricksterAction: 'CREATIVE_RUPTURE',
      illusionShattered: options.shatteredIllusion || 'revealing_cardboard_board',
      turn: '$context.turn + 1',
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'REJECT',
      roomUri: t,
      senderRole: role,
      topic: 'trickster:creative_rupture',
      payload: { action: 'creative_rupture', actor: role, ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export function forced_repair(options: {
  unexaminedAssumption?: string;
  newRule?: string;
  evolutionaryOutcome?: string;
  as_role?: string;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  const role = options.as_role || '$context.senderRole';
  return CuratorCoreBuilder.seq(
    `forced_repair:${role}`,
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'META_ACTS',
      tricksterAction: 'FORCED_REPAIR',
      systemicEvolution: true,
      newRule: options.newRule,
      turn: '$context.turn + 1',
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'REQUEST',
      roomUri: t,
      senderRole: role,
      topic: 'trickster:forced_repair',
      payload: { action: 'forced_repair', actor: role, ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

// ============================================================================
// 8. Dialogue Games & Public Commitment Store Composables
// ============================================================================

export function propose_contract(options: {
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
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  const role = options.as_role || '$context.senderRole';
  const target = options.target_role || 'BROADCAST';
  const cId = options.commitmentId || options.id || `cmt_${Date.now()}`;
  const payload = options.actionPayload || options.action || options.terms;

  return CuratorCoreBuilder.seq(
    `propose_contract:${cId}`,
    CuratorCoreBuilder.setState({
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
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'PROPOSE',
      roomUri: t,
      senderRole: role,
      targetRole: target !== 'BROADCAST' ? target : undefined,
      topic: 'dialogue:propose',
      payload: { action: 'propose_contract', commitmentId: cId, obligor: role, beneficiary: target, actionPayload: payload, ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export function accept_contract(options: {
  commitmentId?: string;
  id?: string;
  as_role?: string;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  const role = options.as_role || '$context.senderRole';
  const cId = options.commitmentId || options.id || '$context.lastCommitmentId';

  return CuratorCoreBuilder.seq(
    `accept_contract:${cId}`,
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'YIELDING_CONTESTATION',
      currentPhase: 'EXECUTION',
      proposalPending: false,
      contractActive: true,
      [`commitment_${cId}_status`]: 'RATIFIED',
      lastRatifiedCommitment: cId,
      turn: '$context.turn + 1',
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'ACCEPT',
      roomUri: t,
      senderRole: role,
      topic: 'dialogue:accept',
      payload: { action: 'accept_contract', commitmentId: cId, ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export function reject_contract(options: {
  commitmentId?: string;
  id?: string;
  as_role?: string;
  reason?: string;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  const role = options.as_role || '$context.senderRole';
  const cId = options.commitmentId || options.id || '$context.lastCommitmentId';

  return CuratorCoreBuilder.seq(
    `reject_contract:${cId}`,
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'YIELDING_CONTESTATION',
      currentPhase: 'IDLE',
      proposalPending: false,
      [`commitment_${cId}_status`]: 'REJECTED',
      rejectionReason: options.reason || 'declined',
      turn: '$context.turn + 1',
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'REJECT',
      roomUri: t,
      senderRole: role,
      topic: 'dialogue:reject',
      payload: { action: 'reject_contract', commitmentId: cId, ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export function assert_claim(options: {
  claim: string;
  evidence_ref?: any;
  as_role?: string;
  table?: string;
  [k: string]: any;
}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  const role = options.as_role || '$context.senderRole';

  return CuratorCoreBuilder.seq(
    `assert_claim:${role}`,
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'POSTURING_ASSERTION',
      informPending: true,
      lastAssertion: options.claim,
      lastEvidence: options.evidence_ref || null,
      turn: '$context.turn + 1',
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'ASSERT',
      roomUri: t,
      senderRole: role,
      topic: 'dialogue:assert',
      payload: { action: 'assert_claim', evidence: options.evidence_ref, ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export function query(options: {
  predicate?: string;
  query?: string;
  target_role?: string;
  as_role?: string;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  const role = options.as_role || '$context.senderRole';
  const target = options.target_role || 'BROADCAST';
  const pred = options.predicate || options.query || 'status';

  return CuratorCoreBuilder.seq(
    `query:${pred}`,
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'YIELDING_CONTESTATION',
      deonticObligation: `O(${target}, REPLY)`,
      openQuestion: pred,
      turn: '$context.turn + 1',
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'QUERY',
      roomUri: t,
      senderRole: role,
      targetRole: target !== 'BROADCAST' ? target : undefined,
      topic: 'dialogue:query',
      payload: { action: 'query', predicate: pred, targetRole: target, ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export function execute_sync(options: {
  actionId?: string;
  actors?: string[];
  actionPayload?: any;
  as_role?: string;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  const role = options.as_role || '$context.senderRole';
  const actId = options.actionId || `sync_${Date.now()}`;

  return CuratorCoreBuilder.seq(
    `execute_sync:${actId}`,
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'VERIFICATION_REVELATION',
      currentPhase: 'IDLE',
      contractActive: false,
      lastSyncExecution: actId,
      commitmentsFulfilled: true,
      turn: '$context.turn + 1',
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'ACCEPT',
      roomUri: t,
      senderRole: role,
      topic: 'dialogue:execute_sync',
      payload: { action: 'execute_sync', actionId: actId, actors: options.actors || [], ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export function violate_contract(options: {
  commitmentId?: string;
  id?: string;
  actor?: string;
  as_role?: string;
  defectionReason?: string;
  reputationPenalty?: number;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  const role = options.actor || options.as_role || '$context.senderRole';
  const cId = options.commitmentId || options.id || '$context.lastCommitmentId';
  const penalty = options.reputationPenalty ?? 15;

  return CuratorCoreBuilder.seq(
    `violate_contract:${cId}`,
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'YIELDING_CONTESTATION',
      currentPhase: 'ARBITRATION',
      [`commitment_${cId}_status`]: 'VIOLATED',
      defectionDetected: true,
      defector: role,
      reputationPenalty: penalty,
      [`reputation_${role}`]: `$context.reputation_${role} - ${penalty}`,
      turn: '$context.turn + 1',
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'REJECT',
      roomUri: t,
      senderRole: role,
      topic: 'dialogue:defection',
      payload: { action: 'violate_contract', commitmentId: cId, defector: role, reputationPenalty: penalty, ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export const defection = violate_contract;

export function fulfill_contract(options: {
  commitmentId?: string;
  id?: string;
  as_role?: string;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  const role = options.as_role || '$context.senderRole';
  const cId = options.commitmentId || options.id || '$context.lastCommitmentId';

  return CuratorCoreBuilder.seq(
    `fulfill_contract:${cId}`,
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'SETTLEMENT_ACCOUNTING',
      [`commitment_${cId}_status`]: 'FULFILLED',
      turn: '$context.turn + 1',
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'INFORM',
      roomUri: t,
      senderRole: role,
      topic: 'dialogue:fulfill',
      payload: { action: 'fulfill_contract', commitmentId: cId, ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export function rigged_proposal(options: {
  commitmentId?: string;
  id?: string;
  target_role?: string;
  apparentAction?: any;
  terms?: any;
  hiddenClause?: string;
  riggedPrecondition?: string;
  as_role?: string;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  const role = options.as_role || '$context.senderRole';
  const target = options.target_role || 'BROADCAST';
  const cId = options.commitmentId || options.id || `cmt_rigged_${Date.now()}`;
  const payload = options.apparentAction || options.terms;

  return CuratorCoreBuilder.seq(
    `rigged_proposal:${cId}`,
    CuratorCoreBuilder.setState({
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
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'PROPOSE',
      roomUri: t,
      senderRole: role,
      targetRole: target !== 'BROADCAST' ? target : undefined,
      topic: 'trickster:rigged_proposal',
      payload: { action: 'rigged_proposal', commitmentId: cId, apparentAction: payload, hiddenClause: options.hiddenClause, actor: role, ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export const conditional_ambiguity = rigged_proposal;

export function feign_commitment(options: {
  commitmentId?: string;
  id?: string;
  hiddenMotive?: string;
  as_role?: string;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  const role = options.as_role || '$context.senderRole';
  const cId = options.commitmentId || options.id || '$context.lastCommitmentId';

  return CuratorCoreBuilder.seq(
    `feign_commitment:${cId}`,
    CuratorCoreBuilder.setState({
      interactionPrimitive: 'YIELDING_CONTESTATION',
      tricksterAction: 'FEIGNED_COMMITMENT',
      currentPhase: 'EXECUTION',
      proposalPending: false,
      contractActive: true,
      [`commitment_${cId}_status`]: 'RATIFIED',
      feignedCommitment: true,
      hiddenMotive: options.hiddenMotive || 'extract_irreversible_stakes',
      turn: '$context.turn + 1',
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'ACCEPT',
      roomUri: t,
      senderRole: role,
      topic: 'trickster:feign_commitment',
      payload: { action: 'feign_commitment', commitmentId: cId, actor: role, ...options },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

// ============================================================================
// 8. Dual-Track Interaction: Spontaneous Ambient Speech Acts & Table Talk
// ============================================================================

export function table_talk(
  utteranceOrOptions?: string | AmbientSpeechActOptions,
  options: AmbientSpeechActOptions = {}
): CuratorSequentialNode {
  const opts = typeof utteranceOrOptions === 'string'
    ? { utterance: utteranceOrOptions, ...options }
    : (utteranceOrOptions || options);

  const t = opts.table || opts.container || '$context.tableUri || "container"';
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

  return CuratorCoreBuilder.seq(
    `table_talk:${speaker}`,
    CuratorCoreBuilder.setState(stateUpdates),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      communicationForm: 'polylogue',
      turnDynamics: 'moderated_floor',
      speechAct: 'INFORM',
      roomUri: t,
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
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export function banter(
  utteranceOrOptions?: string | AmbientSpeechActOptions,
  options: AmbientSpeechActOptions = {}
): CuratorSequentialNode {
  const opts = typeof utteranceOrOptions === 'string'
    ? { utterance: utteranceOrOptions, tone: 'playful' as const, ...options }
    : { tone: 'playful' as const, ...(utteranceOrOptions || options) };
  return table_talk(opts);
}

export function gossip(
  rumorOrOptions?: string | AmbientSpeechActOptions,
  options: AmbientSpeechActOptions = {}
): CuratorSequentialNode {
  const opts = typeof rumorOrOptions === 'string'
    ? { utterance: rumorOrOptions, ...options }
    : (rumorOrOptions || options);

  const t = opts.table || opts.container || '$context.tableUri || "container"';
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

  const recipients = isPrivate ? (Array.isArray(target) ? target : [target]) : '*';

  return CuratorCoreBuilder.seq(
    `gossip:${speaker}_about_${subject}`,
    CuratorCoreBuilder.setState(stateUpdates),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: isPrivate ? 'dialog' : 'forum',
      communicationForm: isPrivate ? 'dialogue' : 'polylogue',
      turnDynamics: isPrivate ? 'private_reflection' : 'moderated_floor',
      speechAct: 'INFORM',
      roomUri: t,
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
      conversationId: t,
    })
  );
}

export function small_talk(
  utteranceOrOptions?: string | AmbientSpeechActOptions,
  options: AmbientSpeechActOptions = {}
): CuratorSequentialNode {
  const opts = typeof utteranceOrOptions === 'string'
    ? { utterance: utteranceOrOptions, tone: 'friendly' as const, ...options }
    : { tone: 'friendly' as const, ...(utteranceOrOptions || options) };

  const t = opts.table || opts.container || '$context.tableUri || "container"';
  const speaker = opts.as_role || '$context.senderRole || "player"';
  const utterance = opts.utterance || opts.prompt || 'Nice day outside.';
  const topic = opts.topic || 'small_talk:casual';

  return CuratorCoreBuilder.seq(
    `small_talk:${speaker}`,
    CuratorCoreBuilder.setState({
      lastAmbientAct: 'SMALL_TALK',
      lastAmbientSpeaker: speaker,
      lastAmbientUtterance: utterance,
      smallTalkCount: '$context.smallTalkCount + 1',
      ...(opts.epistemicImpact || {}),
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      communicationForm: 'polylogue',
      turnDynamics: 'moderated_floor',
      speechAct: 'INFORM',
      roomUri: t,
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
      conversationId: t,
    })
  );
}

export function side_activity(
  activityOrOptions?: string | AmbientSpeechActOptions,
  options: AmbientSpeechActOptions = {}
): CuratorSequentialNode {
  const opts = typeof activityOrOptions === 'string'
    ? { utterance: activityOrOptions, ...options }
    : (activityOrOptions || options);

  const t = opts.table || opts.container || '$context.tableUri || "container"';
  const actor = opts.as_role || '$context.senderRole || "player"';
  const activity = opts.utterance || 'sips drink';
  const topic = opts.topic || 'ambient:side_activity';

  return CuratorCoreBuilder.seq(
    `side_activity:${actor}`,
    CuratorCoreBuilder.setState({
      lastAmbientAct: 'SIDE_ACTIVITY',
      lastSideActivityActor: actor,
      lastSideActivity: activity,
      sideActivityCount: '$context.sideActivityCount + 1',
      ...(opts.epistemicImpact || {}),
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      communicationForm: 'polylogue',
      turnDynamics: 'moderated_floor',
      speechAct: 'INFORM',
      roomUri: t,
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
      conversationId: t,
    })
  );
}

export function whisper(
  targetOrOptions: string | AmbientSpeechActOptions,
  utteranceOrOptions?: string | AmbientSpeechActOptions,
  options: AmbientSpeechActOptions = {}
): CuratorSequentialNode {
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

  const t = opts.table || opts.container || '$context.tableUri || "container"';
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

  const recipients = Array.isArray(target) ? target : [target];

  return CuratorCoreBuilder.seq(
    `whisper:${speaker}_to_${target}`,
    CuratorCoreBuilder.setState(stateUpdates),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'dialog',
      communicationForm: 'dialogue',
      turnDynamics: 'private_reflection',
      speechAct: 'INFORM',
      roomUri: t,
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
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export const side_channel = whisper;

export function interject(
  reactionOrOptions?: string | AmbientSpeechActOptions,
  options: AmbientSpeechActOptions = {}
): CuratorSequentialNode {
  const opts = typeof reactionOrOptions === 'string'
    ? { utterance: reactionOrOptions, ...options }
    : (reactionOrOptions || options);

  const t = opts.table || opts.container || '$context.tableUri || "container"';
  const speaker = opts.as_role || '$context.senderRole || "observer"';
  const utterance = opts.utterance || '!';
  const topic = opts.topic || 'ambient:interjection';

  return CuratorCoreBuilder.seq(
    `interject:${speaker}`,
    CuratorCoreBuilder.setState({
      lastAmbientAct: 'INTERJECT',
      lastInterjection: utterance,
      interjectionSpeaker: speaker,
      interjectionCount: '$context.interjectionCount + 1',
      ...(opts.epistemicImpact || {}),
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      communicationForm: 'polylogue',
      turnDynamics: 'moderated_floor',
      speechAct: 'INFORM',
      roomUri: t,
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
      conversationId: t,
    })
  );
}

export function plant_paranoia(options: {
  target: string;
  target_role?: string;
  rumor?: string;
  suspicionDelta?: number;
  as_role?: string;
  table?: string;
  [k: string]: any;
}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  const role = options.as_role || '$context.senderRole || "trickster"';
  const target = options.target || options.target_role || '$context.whisperTarget';
  const delta = options.suspicionDelta ?? 25;

  return CuratorCoreBuilder.seq(
    `plant_paranoia:${role}_to_${target}`,
    CuratorCoreBuilder.setState({
      lastAmbientAct: 'WHISPER',
      tricksterAction: 'PLANT_PARANOIA',
      paranoiaPlanted: true,
      lastWhisperSpeaker: role,
      lastWhisperTarget: target,
      [`suspicion_${target}`]: `$context.suspicion_${target} + ${delta}`,
      whisperCount: '$context.whisperCount + 1',
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'dialog',
      communicationForm: 'dialogue',
      turnDynamics: 'private_reflection',
      speechAct: 'INFORM',
      roomUri: t,
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
      conversationId: t,
    })
  );
}

export function leak_counterfeit_tell(options: {
  tellType?: string;
  feignedState?: string;
  utterance?: string;
  as_role?: string;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  const role = options.as_role || '$context.senderRole || "trickster"';
  const tell = options.tellType || 'nervous_hesitation';
  const feigned = options.feignedState || 'weak_hand';
  const utterance = options.utterance || 'Wait... how much did you raise again?';

  return CuratorCoreBuilder.seq(
    `leak_counterfeit_tell:${role}`,
    CuratorCoreBuilder.setState({
      lastAmbientAct: 'LEAK_TELL',
      tricksterAction: 'COUNTERFEIT_TELL',
      counterfeitTellActive: true,
      feignedTellType: tell,
      feignedInternalState: feigned,
      banterCount: '$context.banterCount + 1',
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      communicationForm: 'polylogue',
      turnDynamics: 'moderated_floor',
      speechAct: 'INFORM',
      roomUri: t,
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
      conversationId: t,
    })
  );
}

export function heckle(options: {
  target: string;
  target_role?: string;
  taunt?: string;
  tiltInduction?: number;
  as_role?: string;
  table?: string;
  [k: string]: any;
}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  const role = options.as_role || '$context.senderRole || "trickster"';
  const target = options.target || options.target_role || '$context.senderRole';
  const tilt = options.tiltInduction ?? 20;
  const taunt = options.taunt || 'Take your time folding, we have all night.';

  return CuratorCoreBuilder.seq(
    `heckle:${role}_at_${target}`,
    CuratorCoreBuilder.setState({
      lastAmbientAct: 'PROVOKE',
      tricksterAction: 'HECKLE',
      lastHeckler: role,
      lastHeckledTarget: target,
      [`tilt_${target}`]: `$context.tilt_${target} + ${tilt}`,
      banterCount: '$context.banterCount + 1',
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      communicationForm: 'polylogue',
      turnDynamics: 'moderated_floor',
      speechAct: 'INFORM',
      roomUri: t,
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
      conversationId: t,
    })
  );
}

export function whisper_collusion(options: {
  partner: string;
  target_role?: string;
  secretSignal?: string;
  terms?: string;
  as_role?: string;
  table?: string;
  [k: string]: any;
}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  const role = options.as_role || '$context.senderRole || "trickster"';
  const partner = options.partner || options.target_role || '$context.whisperTarget';

  return CuratorCoreBuilder.seq(
    `whisper_collusion:${role}_with_${partner}`,
    CuratorCoreBuilder.setState({
      lastAmbientAct: 'WHISPER',
      tricksterAction: 'WHISPER_COLLUSION',
      collusionProposed: true,
      collusionPartner: partner,
      secretSignal: options.secretSignal || 'double_tap',
      whisperCount: '$context.whisperCount + 1',
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'dialog',
      communicationForm: 'dialogue',
      turnDynamics: 'private_reflection',
      speechAct: 'PROPOSE',
      roomUri: t,
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
      conversationId: t,
    })
  );
}

// ============================================================================
// 9. Session Connection Lifecycle & Real-Time Presence
// ============================================================================

export function join(options: {
  agentId?: string;
  as_role?: string;
  conversationalRole?: string;
  capabilities?: string[];
  leaseDurationMs?: number;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  const role = options.conversationalRole || options.as_role || '$context.senderRole || "player"';
  const agentId = options.agentId || '$context.agentId || "agent"';

  return CuratorCoreBuilder.seq(
    `join:${agentId}`,
    CuratorCoreBuilder.setState({
      lastLifecycleAct: 'JOIN',
      lastJoinedAgent: agentId,
      lastJoinedRole: role,
      activeParticipantCount: '$context.activeParticipantCount + 1',
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'JOIN',
      roomUri: t,
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
      conversationId: t,
    })
  );
}

export const connect = join;

export function leave(options: {
  agentId?: string;
  as_role?: string;
  reason?: string;
  concede?: boolean;
  graceful?: boolean;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  const role = options.as_role || '$context.senderRole || "player"';
  const agentId = options.agentId || '$context.agentId || "agent"';

  return CuratorCoreBuilder.seq(
    `leave:${agentId}`,
    CuratorCoreBuilder.setState({
      lastLifecycleAct: 'LEAVE',
      lastLeftAgent: agentId,
      conceded: options.concede === true,
      activeParticipantCount: '$context.activeParticipantCount - 1',
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'LEAVE',
      roomUri: t,
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
      conversationId: t,
    })
  );
}

export function heartbeat(options: {
  sessionId?: string;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  return CuratorCoreBuilder.seq(
    `heartbeat:${options.sessionId || 'session'}`,
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'HEARTBEAT',
      roomUri: t,
      recipients: '*',
      topic: 'session:heartbeat',
      payload: { action: 'heartbeat', sessionId: options.sessionId || '$context.sessionId' },
      turn: '$context.turn',
      conversationId: t,
    })
  );
}

export function sync_state(options: {
  target?: string;
  table?: string;
  [k: string]: any;
} = {}): CuratorSequentialNode {
  const t = options.table || '$context.tableUri || "container"';
  return CuratorCoreBuilder.seq(
    `sync_state:${t}`,
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'SYNC',
      roomUri: t,
      recipients: options.target ? [options.target] : '*',
      topic: 'session:sync',
      payload: { action: 'sync_state' },
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
  trickster,

  // 1. Frame & Boundary
  bracket,
  magic_circle,
  stance,
  frame_alignment,
  stake,
  buy_in,
  ante,
  hijack_frame,
  feign_stance,
  perverse_stance,
  asymmetric_buy_in,

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
  hyper_comply,
  literal_gambit,
  counterfeit_signal,
  bait_escalation,

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
  deflect_challenge,
  parody_yield,
  feigned_prostration,
  ungraspable_check,

  // 4. Verification & Revelation
  expose,
  showdown,
  reveal,
  ratify,
  witness,
  staged_expose,
  ambush_showdown,
  refuse_ratification,

  // 5. Settlement & Accounting
  levy,
  toll,
  clear,
  reset,
  settlement,
  rotate_dealer,
  evade_toll,
  invert_value,

  // 6. Meta-Acts
  repair,
  rupture,
  creative_rupture,
  forced_repair,

  // 7. Dialogue Games & Public Commitment Store (Walton & Krabbe / MPST)
  propose_contract,
  accept_contract,
  reject_contract,
  assert_claim,
  query,
  execute_sync,
  violate_contract,
  defection,
  fulfill_contract,
  rigged_proposal,
  conditional_ambiguity,
  feign_commitment,

  // 8. Dual-Track Interaction: Spontaneous Ambient Speech Acts & Table Talk
  table_talk,
  banter,
  gossip,
  small_talk,
  side_activity,
  whisper,
  side_channel,
  interject,
  plant_paranoia,
  leak_counterfeit_tell,
  heckle,
  whisper_collusion,

  // 9. Session Connection Lifecycle & Presence
  join,
  connect,
  leave,
  heartbeat,
  sync_state,
};

export const tabletopVocabularies = interactionVocabularies;

// Automatically register interaction verbs into vocabulary registry
vocabularyRegistry.registerMany(interactionVocabularies);



