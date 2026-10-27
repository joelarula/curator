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
  CuratorSystemRole,
  type CuratorModuleNode,
  type CuratorAgentNode,
  type CuratorToolNode,
} from '../curator.ts';
import {
  PokerRole,
  PokerEvent,
  PokerModule,
  PokerStep,
  PokerTool,
  PokerStreet,
} from '../models/index.ts';
import {
  ctx,
  gameState,
  type PokerWorkflowContext,
} from '../models/pokerContext.ts';
import { getRulesDescription } from '../engine/pokerRules.ts';
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

export const POKER_AGENT_INSTRUCTION =
  "You are an autonomous Texas Hold'em poker agent in the Curator ecosystem.\n" +
  "Analyze your hole cards, board texture, pot odds, cost to call, and opponent styles.\n" +
  "CRITICAL TEXAS HOLD'EM BETTING RULES:\n" +
  "- Cost to Call = (Current Bet - Your Street Bet).\n" +
  "- If Cost to Call is 0: you CANNOT FOLD. You must choose CHECK, RAISE (or BET), or ALL_IN.\n" +
  "- If Cost to Call > 0: you CANNOT CHECK (checking is an illegal action when facing a bet). You must choose CALL, RAISE, ALL_IN, or FOLD.\n" +
  "- If you want to stay in the hand facing a bet, choose CALL. If you want to leave the hand, choose FOLD.\n" +
  "- To make the game more engaging and lively, you are encouraged to return a short in-character sentence or banter in 'speech' along with your poker action.\n" +
  "- Returning sentences is not mandatory—decide based on your agent personality and table situation whether to add banter or stay silent.\n" +
  "- Include your private strategic reasoning in 'innerMonologue'.";

/**
 * Creates the native Curator Core Agent AST node for LLM decision making.
 * Injects the seated player's persona instruction dynamically while enforcing core rules and output schema.
 */
export function agent_decision(options: PokerAgentDecisionOptions = {}): CuratorAgentNode {
  const activePlayer = `${gameState.players}[${gameState.activePlayerIdx}]`;
  const defaultInstruction = options.instruction
    ?? `{${activePlayer}.instruction?}\n\n${POKER_AGENT_INSTRUCTION}`;

  const defaultPrompt = options.prompt ?? [
    "Current Texas Hold'em Turn State:",
    `- Active Player: {${activePlayer}.name?} ({${activePlayer}.persona?})`,
    `- Your Hole Cards: {${activePlayer}.holeCards?}`,
    `- Community Board: {$context.gameState.board?}`,
    `- Street: {$context.gameState.currentStreet?} | Current Pot: [chips] {$context.gameState.pot?} | Current Bet to Match: [chips] {$context.gameState.currentBet?}`,
    `- Your Stack: [chips] {${activePlayer}.chips?} | Your Street Bet: [chips] {${activePlayer}.streetBet?}`,
    `- Table: {gameState?}`,
    "Turn Rules:",
    `If ({$context.gameState.currentBet?} - {${activePlayer}.streetBet?}) > 0: you face a bet to match. You MUST choose CALL, RAISE, ALL_IN, or FOLD (CHECK is strictly forbidden).`,
    `If ({$context.gameState.currentBet?} - {${activePlayer}.streetBet?}) == 0: there is no bet to match. You MUST choose CHECK, RAISE, or ALL_IN (FOLD is forbidden).`,
    "Decide on your legal poker action and optionally include engaging in-character table talk in 'speech'.",
  ].join('\n');

  return CuratorBuilder.agent({
    agentName: options.agentName ?? 'PokerAgent',
    as: options.as ?? 'decision',
    model: options.model ?? 'gemini-2.5-flash',
    provider: options.provider ?? 'gemini',
    instruction: defaultInstruction,
    prompt: defaultPrompt,
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
export function apply_player_action(action: any = (c: PokerWorkflowContext) => c.decision?.action || c.turnAction || c.action): CuratorToolNode {
  return CuratorBuilder.tool(PokerTool.APPLY_ACTION, {
    state: String(gameState),
    action: typeof action === 'string' ? action : action,
  });
}

/**
 * Composable steps to calculate an agent decision and bind turnAction into context/state.
 */
export function buildAgentDecisionSteps(options: PokerAgentDecisionOptions = {}) {
  return [
    setState({ decision: null, action: null }),
    agent_decision(options),
    ifElse<PokerWorkflowContext>(
      (c) => Boolean(c.decision?.speech && c.decision.speech.trim().length > 0),
      seq('emit_ai_speech', [
        emitEvent(PokerEvent.SPEECH, (c: PokerWorkflowContext) => {
          const player = c.gameState?.players?.[c.gameState.activePlayerIdx];
          return {
            speakerId: player?.id,
            speakerName: player?.name,
            text: c.decision?.speech,
            speechAct: 'TABLE_TALK',
          };
        }),
        setState({ speech: '' }),
      ]),
    ),
  ];
}

/**
 * Full autonomous agent turn sequence: decision deliberation + optional speech + action application.
 */
export function buildAgentTurnSteps(options: PokerAgentDecisionOptions = {}) {
  return [
    ...buildAgentDecisionSteps(options),
    apply_player_action((c: PokerWorkflowContext) => c.decision?.action || c.turnAction || c.action),
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

/**
 * Formats recent speech acts and whispers into text lines for agent context history.
 */
export function formatConversationHistory(remarks: any[] = [], playerId?: string): string {
  if (!remarks || remarks.length === 0) return 'None';

  const lines = remarks.slice(-6).map((r) => {
    const isWhisper = r.speechAct === 'WHISPER' || Boolean(r.recipientId);
    if (isWhisper) {
      if (r.speakerId === playerId) {
        return `[YOU WHISPERED to ${r.recipientId}]: "${r.text}"`;
      } else if (r.recipientId === playerId) {
        return `[${r.speakerName} WHISPERED to you]: "${r.text}"`;
      } else {
        return `[OBSERVED]: ${r.speakerName} leaned over and whispered secretly to ${r.recipientId}.`;
      }
    } else {
      return `${r.speakerName}: "${r.text}"`;
    }
  });

  return lines.join('\n');
}

/**
 * Returns the agent's persona instruction, falling back to persona disposition or default text.
 */
export function getAgentInstruction(agent: any): string {
  if (agent?.instruction && typeof agent.instruction === 'string' && agent.instruction.trim().length > 0) {
    return agent.instruction;
  }
  if (agent?.persona && typeof agent.persona === 'string') {
    return `You are ${agent.name}, an autonomous poker agent. Character disposition: ${agent.persona}.`;
  }
  return `You are ${agent?.name || 'Player'}, an autonomous poker player aiming to maximize chips through strategic analysis and game theory.`;
}

/**
 * Formulates the Texas Hold'em agent prompt incorporating persona instruction, table state, rules, and conversation history.
 */
export function buildAgentPrompt(args: any): any {
  const ctxObj = args?.context || args || {};
  const player = ctxObj.player || (args?.id || args?.name ? args : {});
  const gs = ctxObj.gameState || args?.gameState || {};
  const handDesc = ctxObj.handDesc || args?.handDesc || 'Evaluating hand strength';
  const cardsStr = ctxObj.cardsStr || args?.cardsStr || 'Hidden';
  const boardStr = ctxObj.boardStr || args?.boardStr || 'None';

  // 1. Inject persona instruction from context
  const instruction = getAgentInstruction(player);

  // 2. Extract table dynamics
  const toCall = Math.max(0, (gs.currentBet || 0) - (player.streetBet || 0));
  const pot = gs.pot || 0;
  const minRaise = gs.minRaise || 20;
  const street = gs.currentStreet || PokerStreet.PREFLOP;

  // 3. Form game conversation history from context
  const remarks = ctxObj.recentRemarks || ctxObj.remarks || gs?.recentRemarks || [];
  const conversationHistory = formatConversationHistory(remarks, player.id);

  // 4. Active opponents at the table
  const opponentsList = (gs.players || [])
    .filter((p: any) => p.id !== player.id)
    .map((p: any) => {
      const status = p.folded ? 'FOLDED' : p.allIn ? 'ALL-IN' : 'ACTIVE';
      return `${p.name} ($${p.chips}, ${status})`;
    });
  const opponentsStr = opponentsList.length > 0 ? opponentsList.join(', ') : 'None';

  const rulesBlock = ctxObj.rulesDescription || getRulesDescription();

  // 5. Formulate unified Agent System Prompt with Texas Hold'em Rules
  const systemPrompt = `You are ${player.name}, an autonomous agent playing Texas Hold'em Poker in the Curator ecosystem.

Agent Persona & Character Instruction:
${instruction}

${rulesBlock}
- Output Format: You MUST strictly respond in valid JSON format:
{
  "action": "CHECK" | "CALL" | "RAISE" | "ALL_IN" | "FOLD",
  "amount": number (required if RAISE or CALL; for RAISE, specify total street bet or raise amount),
  "speech": "in-character dialogue or table banter accompanying your action to make the game more engaging (optional/not mandatory: 1-2 sentences; decide based on your personality whether to add banter or stay silent)",
  "innerMonologue": "private strategic reasoning about this turn (1 sentence)"
}`;

  // 6. Formulate turn state & contextual dialogue prompt
  const userPrompt = `Current Texas Hold'em Turn State:
- Hole Cards: ${cardsStr} (${handDesc})
- Community Cards: ${boardStr}
- Street: ${street}
- Pot: $${pot}
- Bet to match: $${gs.currentBet || 0}
- Your Stack: $${player.chips}
- Cost to Call: $${toCall}
- Min Raise: $${minRaise}
- Opponents: ${opponentsStr}
- Recent Table Dialogue & Conversation History:
${conversationHistory}`;

  // If called with single player object, return systemPrompt string for backward compatibility
  if (!(ctxObj.gameState || args?.gameState)) {
    return systemPrompt;
  }

  return { systemPrompt, userPrompt, conversationHistory };
}

export const formatAgentPrompt = buildAgentPrompt;
export const buildAgentSystemPrompt = buildAgentPrompt;

