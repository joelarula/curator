/**
 * ---
 * id: agent_turn
 * name: agent_turn
 * description: Autonomous Player Agent Turn Module using seated agent instruction & prompt
 * ---
 */
import {
  defineModule,
  defineSubroutine,
  seq,
  ifElse,
  setState,
  emitEvent,
  CuratorBuilder,
  type CuratorModuleNode,
  type CuratorAgentNode,
  type CuratorToolNode,
} from '../curator.ts';
import {
  PokerEvent,
  PokerModule,
  PokerStep,
  PokerTool,
} from '../models/index.ts';
import {
  ctx,
  gameState,
} from '../models/pokerContext.ts';

export interface PokerAgentDecisionOptions {
  agentName?: string;
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
    speech: { type: 'string' },
    innerMonologue: { type: 'string' },
  },
  required: ['action'],
};

export const POKER_AGENT_INSTRUCTION =
  "You are an autonomous Texas Hold'em poker agent in the Curator ecosystem. " +
  "Analyze your hole cards, board texture, pot odds, cost to call, and opponent styles. " +
  "Select a mathematically sound or deceptive legal poker action: CHECK, CALL, RAISE, ALL_IN, or FOLD. " +
  "If cost to call is 0, never fold for free—check or bet/raise. " +
  "You may also optionally include in-character table talk dialogue in 'speech' and your strategic reasoning in 'innerMonologue'.";

/**
 * Creates the native Curator Core Agent AST node for LLM decision making.
 */
export function agent_decision(options: PokerAgentDecisionOptions = {}): CuratorAgentNode {
  return CuratorBuilder.agent({
    agentName: options.agentName ?? `${gameState.players}[${gameState.activePlayerIdx}].name || 'PokerAgent'`,
    model: options.model ?? 'gemini-2.5-flash',
    provider: options.provider ?? 'gemini',
    instruction: options.instruction ?? POKER_AGENT_INSTRUCTION,
    prompt: options.prompt ?? "Current Texas Hold'em Turn State:\n- Table: {gameState?}",
    history_from: 'conversation',
    history_events: [PokerEvent.ACTION_TAKEN, PokerEvent.SPEECH, PokerEvent.AMBIENT_SPOKEN],
    output_schema: options.output_schema ?? POKER_DECISION_OUTPUT_SCHEMA,
    ...(options.tools ? { tools: options.tools } : {}),
  });
}

export const ai_decision = agent_decision;

/**
 * Tool helper applying a player's action to game state.
 */
export function apply_player_action(action: any = `${ctx.action} || ${ctx.turnAction} || ${ctx.lastAiAction}`): CuratorToolNode {
  return CuratorBuilder.tool(PokerTool.APPLY_ACTION, {
    state: String(gameState),
    action: typeof action === 'string' ? action : String(action),
  });
}

/**
 * Composable steps to calculate an agent decision and bind turnAction into context/state.
 */
export function buildAgentDecisionSteps(options: PokerAgentDecisionOptions = {}) {
  return [
    agent_decision(options),
    setState({ turnAction: `${ctx.action} || ${ctx.turnAction} || ${ctx.lastAiAction}` }),
    ifElse(
      `${ctx.speech} && ${ctx.speech}.length > 0`,
      emitEvent(PokerEvent.SPEECH, {
        speakerId: `${gameState.players}[${gameState.activePlayerIdx}].id`,
        speakerName: `${gameState.players}[${gameState.activePlayerIdx}].name`,
        text: String(ctx.speech),
        speechAct: 'TABLE_TALK',
      }),
    ),
  ];
}

/**
 * Full autonomous agent turn sequence: decision deliberation + optional speech + action application.
 */
export function buildAgentTurnSteps(options: PokerAgentDecisionOptions = {}) {
  return [
    agent_decision(options),
    ifElse(
      `${ctx.speech} && ${ctx.speech}.length > 0`,
      emitEvent(PokerEvent.SPEECH, {
        speakerId: `${gameState.players}[${gameState.activePlayerIdx}].id`,
        speakerName: `${gameState.players}[${gameState.activePlayerIdx}].name`,
        text: String(ctx.speech),
        speechAct: 'TABLE_TALK',
      }),
    ),
    apply_player_action(`${ctx.action} || ${ctx.turnAction} || ${ctx.lastAiAction}`),
  ];
}

/**
 * Subroutine for autonomous AI decision calculation and action dispatch.
 */
export const aiAgentFlow = defineSubroutine('ai_agent_flow', {
  defaultMode: 'inline',
  body: seq(PokerStep.AI_AGENT_FLOW, buildAgentTurnSteps()),
});

/**
 * Compiled Curator AST Module for autonomous player agent turns.
 */
export function buildAgentTurnModule(): CuratorModuleNode {
  return defineModule(PokerModule.AGENT_TURN, {
    description: 'Autonomous AI player decision flow with LLM persona and prompt injection',
    subroutines: [aiAgentFlow],
  }, () => buildAgentTurnSteps());
}

export const agentTurnAst = buildAgentTurnModule();
