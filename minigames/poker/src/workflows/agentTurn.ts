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
} from '../models/pokerContext.ts';
import { getRulesDescription } from '../engine/pokerRules.ts';

export interface PokerAgentProfile {
  id: string;
  name: string;
  scriptName?: string;
  schedule?: string;
  enabled?: boolean;
  instruction: string;
  persona: string;
  isHuman?: boolean;
  roles: string[];
}

export const POKER_AI_PROFILES: Record<string, PokerAgentProfile> = {
  viper: {
    id: 'viper',
    name: 'Viper (Shark)',
    scriptName: PokerModule.AGENT_TURN,
    schedule: 'manual',
    enabled: true,
    instruction:
      "You are Viper, a ruthless and mathematically calculating poker shark at a high-stakes Texas Hold'em table. Your tone is cool, precise, psychological, and dismissive of emotional play. You never reveal your exact hole cards. When speaking, you comment on pot odds, variance, and the foolishness of loose play.",
    persona: 'shark',
    roles: [PokerRole.PLAYER, PokerRole.SPECTATOR, CuratorSystemRole.AGENT_READER],
  },
  maddog: {
    id: 'maddog',
    name: 'MadDog (Maniac)',
    scriptName: PokerModule.AGENT_TURN,
    schedule: 'manual',
    enabled: true,
    instruction:
      'You are MadDog, a wild and loud poker maniac. You play loose, love bluffing, and shove chips into the middle for maximum adrenaline. Your tone is boisterous, confrontational, taunting, and energetic. Trash-talk, dare people to call, and embrace chaos.',
    persona: 'maniac',
    roles: [PokerRole.PLAYER, PokerRole.SPECTATOR, CuratorSystemRole.AGENT_READER],
  },
  barnaby: {
    id: 'barnaby',
    name: 'Barnaby (Station)',
    scriptName: PokerModule.AGENT_TURN,
    schedule: 'manual',
    enabled: true,
    instruction:
      'You are Barnaby, an affable, folksy, and warm calling station. You love chatting at the table, hate folding, and always wonder what the next card will bring. Your tone is grandfatherly, cheerful, gentle, and humorous.',
    persona: 'station',
    roles: [PokerRole.PLAYER, PokerRole.SPECTATOR, CuratorSystemRole.AGENT_READER],
  },
};

/**
 * Default autonomous AI opponents seated at Texas Hold'em tables.
 */
export const DEFAULT_AI_PLAYERS: PokerAgentProfile[] = [
  POKER_AI_PROFILES.viper,
  POKER_AI_PROFILES.maddog,
  POKER_AI_PROFILES.barnaby,
];

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
 * Injects the seated player's persona instruction dynamically while enforcing core rules and output schema.
 */
export function agent_decision(options: PokerAgentDecisionOptions = {}): CuratorAgentNode {
  const activePlayer = `${gameState.players}[${gameState.activePlayerIdx}]`;
  const defaultInstruction = options.instruction
    ?? `{${activePlayer}.instruction?}\n\n${POKER_AGENT_INSTRUCTION}`;

  return CuratorBuilder.agent({
    agentName: options.agentName ?? `${activePlayer}.name || 'PokerAgent'`,
    model: options.model ?? 'gemini-2.5-flash',
    provider: options.provider ?? 'gemini',
    instruction: defaultInstruction,
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
  "speech": "dialogue spoken out loud to the table (optional, 1 sentence in character)",
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

