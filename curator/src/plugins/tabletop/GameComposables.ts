import type { CuratorSequentialNode } from '../../engine/CuratorAst.js';
import { CuratorCoreBuilder } from '../../engine/builder/CuratorCoreBuilder.js';
import { FluentGameBuilder } from './FluentGameBuilder.js';

export function game(tableUri: string): FluentGameBuilder {
  return new FluentGameBuilder(tableUri);
}

export function table(tableUri: string): FluentGameBuilder {
  return new FluentGameBuilder(tableUri);
}

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

export function challenge(options: {
  as_role?: string;
  target_role?: string;
  table?: string;
  [k: string]: any;
}): CuratorSequentialNode {
  return contestation({ action: 'challenge', ...options });
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

export const tabletopVocabularies = {
  game,
  table,
  ante,
  bid,
  deal,
  deal_private,
  deal_public,
  draw,
  hit,
  discard,
  swap,
  wager,
  claim,
  contestation,
  stand,
  fold,
  call,
  challenge,
  lead,
  play_card,
  capture,
  showdown,
  reveal,
  settlement,
  rotate_dealer,
};
