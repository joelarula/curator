/**
 * ---
 * id: agent_turn
 * name: agent_turn
 * description: LLM seat - persona deliberation for the active player
 * ---
 */
import {
  defineModule,
  defineSubroutine,
  CuratorBuilder,
  type CuratorModuleNode,
  type CuratorAgentNode,
} from '../curator.ts';
import { PokerEvent, PokerModule, PokerSpeechAct, PokerSpeechOrigin } from '../models/index.ts';
import { ctx, actor, gameState, ifElse } from '../models/pokerContext.ts';
import { Speech } from '../models/pokerEvents.ts';
import { getRulesDescription } from '../engine/pokerRules.ts';
import { DEFAULT_SEAT_MODEL } from '../pokerConfig.ts';

/** The seat whose turn it is (Pillar 1: dynamic proxy indexing via `.at()`). */
const activePlayer = gameState.players.at(gameState.activePlayerIdx);

export {
  POKER_AI_PROFILES,
  DEFAULT_AI_PLAYERS,
  type PokerAgentProfile,
} from './agentProfiles.ts';

export interface PokerAgentDecisionOptions {
  agentName?: string;
  as?: string;
  model?: string;
  provider?: 'gemini' | 'local';
  instruction?: string;
  prompt?: string;
  output_schema?: Record<string, any>;
  tools?: (string | any)[];
}

export const POKER_DECISION_OUTPUT_SCHEMA: Record<string, any> = {
  type: 'object',
  properties: {
    action: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['CHECK', 'CALL', 'BET', 'RAISE', 'ALL_IN', 'FOLD'],
        },
        amount: { type: 'number' },
      },
      required: ['type'],
    },
    turnAction: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['CHECK', 'CALL', 'BET', 'RAISE', 'ALL_IN', 'FOLD'],
        },
        amount: { type: 'number' },
      },
      required: ['type'],
    },
    speech: {
      type: 'string',
      description: 'Optional in-character dialogue or table banter (1-2 sentences) along with your poker action to make the game more engaging. Sentences are not mandatory; decide based on your character personality and situation whether to add banter or remain silent.',
    },
    innerMonologue: {
      type: 'string',
      description: 'Private strategic reasoning about this turn (1 sentence).',
    },
  },
  required: ['action'],
};

/** How an LLM seat plays: persona first, then the engine's table rules, then the answer protocol. */
export const POKER_AGENT_PROTOCOL = [
  "Analyze your hole cards, board texture, pot odds, cost to call, and opponent styles.",
  "- You are encouraged to add a short in-character sentence or banter in 'speech' along with your action; stay silent when your persona would.",
  "- Include your private strategic reasoning in 'innerMonologue'.",
].join('\n');

/**
 * The model a seat (`$params.actor`) thinks with, resolved per call: the seat's own `model`, then
 * `$config.poker.models.seat`, then the default.
 */
export const SEAT_MODEL = `${actor.model} || $config.poker?.models?.seat || '${DEFAULT_SEAT_MODEL}'`;
/** The model a seat talks with between decisions: its own, then `models.chatter`, then the seat model. */
export const CHATTER_MODEL = `${actor.model} || $config.poker?.models?.chatter || $config.poker?.models?.seat || '${DEFAULT_SEAT_MODEL}'`;
/** What a seat remembers of the table: every action and every line said. */
export const SEAT_HISTORY_EVENTS = [PokerEvent.ACTION_TAKEN, PokerEvent.SPEECH];

/** Who the seat (`$params.actor`) is: its persona instruction. */
export const seatPersona = (): string =>
  `You are ${actor.name.optional()}, an autonomous Texas Hold'em poker agent. ${actor.instruction.optional()}`;

/** What the seat (`$params.actor`) sees: its cards and stack, the board, the pot and the whole table. */
export const seatView = (): string[] => [
  `- Your Hole Cards: ${actor.holeCards.optional()}`,
  `- Community Board: ${gameState.board.optional()}`,
  `- Street: ${gameState.currentStreet.optional()} | Pot: [chips] ${gameState.pot.optional()} | Current Bet: [chips] ${gameState.currentBet.optional()}`,
  `- Your Stack: [chips] ${actor.chips.optional()} | Your Street Bet: [chips] ${actor.streetBet.optional()}`,
  `- Cost to Call: [chips] {${gameState.currentBet} - ${actor.streetBet}?} | Min Raise: [chips] ${gameState.minRaise.optional()}`,
  `- Table: ${gameState.optional()}`,
];

/**
 * The LLM decision for the seat being played (`$params.actor`): persona instruction, the engine's
 * rules, the turn's numbers, and the shared table conversation as history.
 */
export function agent_decision(options: PokerAgentDecisionOptions = {}): CuratorAgentNode {
  const instruction = options.instruction ?? [
    seatPersona(),
    getRulesDescription(),
    POKER_AGENT_PROTOCOL,
  ].join('\n\n');

  const prompt = options.prompt ?? [
    "Current Texas Hold'em Turn State:",
    ...seatView(),
    "Decide on your legal poker action and optionally include in-character table talk in 'speech'.",
  ].join('\n');

  return CuratorBuilder.agent({
    agentName: options.agentName ?? 'PokerAgent',
    as: options.as ?? 'decision',
    model: options.model ?? SEAT_MODEL,
    provider: options.provider ?? 'gemini',
    instruction,
    prompt,
    history_from: 'conversation',
    history_events: SEAT_HISTORY_EVENTS,
    output_schema: options.output_schema ?? POKER_DECISION_OUTPUT_SCHEMA,
    ...(options.tools ? { tools: options.tools } : {}),
  });
}

/** LLM seat: persona deliberation with optional table talk; returns the decided action. */
export const aiDecision = defineSubroutine('ai_decision', {
  params: { actor: { type: 'object', required: true } },
  body: [
    agent_decision(),
    ifElse((c) => Boolean(c.decision?.speech?.trim()), [
      Speech.emit({
        speakerId: actor.id,
        speakerName: actor.name,
        text: ctx.decision.speech,
        speechAct: PokerSpeechAct.TABLE_TALK,
        origin: PokerSpeechOrigin.TURN,
        depth: 0,
      }),
    ]),
  ],
  returns: String(ctx.decision.action),
});

/** The LLM seat's own script: deliberates for the active seat. */
export const agentTurnAst: CuratorModuleNode = defineModule(PokerModule.AGENT_TURN, {
  description: 'LLM seat: persona deliberation for the active player',
}, () => [aiDecision({ actor: activePlayer })]);
