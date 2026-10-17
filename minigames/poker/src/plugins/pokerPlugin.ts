import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineTool, type CuratorPlugin } from '../curator.ts';
import type { PokerGameState, PlayerAction } from '../types.ts';
import {
  initPokerLobby,
  joinPokerLobby,
  leavePokerLobby,
  startPokerHand,
  agenticDecidePokerAction,
  applyPokerAction,
  dealPokerStreet,
  fastForwardPokerBoard,
  distributePokerPots,
  rotatePokerDealer,
  processHumanSpeech,
  checkPokerGameOver,
  getPokerStandings,
  getLegalChoices,
} from '../engine/pokerEngine.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Loads raw CoffeeScript file contents for all .coffee files in scripts/.
 * Curator Core parses headers/metadata and handles registration during plugin registration.
 */
export function loadPokerScriptSources(): Record<string, string> {
  const scriptsDir = path.resolve(__dirname, '../scripts');
  const files = fs.readdirSync(scriptsDir).filter((f) => f.endsWith('.coffee'));
  const sources: Record<string, string> = {};
  for (const file of files) {
    const id = path.basename(file, '.coffee');
    sources[id] = fs.readFileSync(path.join(scriptsDir, file), 'utf-8');
  }
  return sources;
}

// Re-export domain logic for consumer backwards-compatibility
export * from '../engine/pokerEngine.ts';

// ----------------------------------------------------------------------------
// Curator Tool Registrations
// ----------------------------------------------------------------------------

export const pokerInitLobbyTool = defineTool({
  name: 'poker_init_lobby',
  description: 'Initializes Texas Holdem lobby frame. Can accept dynamic initial players or start as an open table.',
  parameters: {
    type: 'object',
    properties: {
      tableId: { type: 'string' },
      startingChips: { type: 'number' },
      sbAmount: { type: 'number' },
      bbAmount: { type: 'number' },
      maxSeats: { type: 'number' },
      revealHandsOnSettle: { type: 'boolean' },
      maxHands: { type: 'number' },
      players: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            instruction: { type: 'string' },
            provider: { type: 'string' },
            persona: { type: 'string' },
            model: { type: 'string' },
            isHuman: { type: 'boolean' },
            chips: { type: 'number' },
            seatIdx: { type: 'number' },
          },
          required: ['id', 'name'],
        },
      },
    },
  },
  execute: async (args: any) => {
    return initPokerLobby(args);
  },
});

export const pokerJoinLobbyTool = defineTool({
  name: 'poker_join_lobby',
  description: 'Dynamically seats an agent or human player at the poker table with their wallet / buy-in.',
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
      player: { type: 'object' },
      id: { type: 'string' },
      name: { type: 'string' },
      instruction: { type: 'string' },
      provider: { type: 'string' },
      persona: { type: 'string' },
      model: { type: 'string' },
      isHuman: { type: 'boolean' },
      wallet: { type: 'number' },
      buyIn: { type: 'number' },
      chips: { type: 'number' },
      seatIdx: { type: 'number' },
    },
  },
  execute: async (args: any, ctx: any) => {
    const rawState = (args?.state || ctx?.state?.gameState || ctx?.context?.gameState) as PokerGameState;
    const pData = args?.player || args;
    return joinPokerLobby(rawState, pData);
  },
});

export const pokerLeaveLobbyTool = defineTool({
  name: 'poker_leave_lobby',
  description: 'Removes or cashes out a player from the poker table.',
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
      id: { type: 'string' },
    },
    required: ['id'],
  },
  execute: async (args: any, ctx: any) => {
    const rawState = (args?.state || ctx?.state?.gameState || ctx?.context?.gameState) as PokerGameState;
    const id = args.id as string;
    return leavePokerLobby(rawState, id);
  },
});

export const pokerStartHandTool = defineTool({
  name: 'poker_start_hand',
  description: 'Starts a new hand: shuffles deck, posts blinds, deals hole cards.',
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
    },
  },
  execute: async (args: any, ctx: any) => {
    const rawState = (args?.state || ctx?.state?.gameState || ctx?.context?.gameState) as PokerGameState;
    return startPokerHand(rawState);
  },
});

export const pokerAiDecisionTool = defineTool({
  name: 'poker_ai_decision',
  description: 'Calculates AI player action and ambient remark via Curator Agentic Engine.',
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
      playerIdx: { type: 'number' },
    },
  },
  execute: async (args: any, ctx: any) => {
    const rawState = (args?.state || ctx?.state?.gameState || ctx?.context?.gameState) as PokerGameState;
    const idx = args?.playerIdx ?? rawState.activePlayerIdx;
    const player = rawState.players[idx];

    const action = await agenticDecidePokerAction(player, rawState);
    return { action };
  },
});

export const pokerApplyActionTool = defineTool({
  name: 'poker_apply_action',
  description: 'Applies player action (FOLD, CHECK, CALL, RAISE, ALL_IN) to table state.',
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
      action: { type: 'object' },
    },
  },
  execute: async (args: any, ctx: any) => {
    const rawState = (args?.state || ctx?.state?.gameState || ctx?.context?.gameState) as PokerGameState;
    const action = (args?.action || ctx?.context?.lastAction || { type: 'CHECK' }) as PlayerAction;
    return applyPokerAction(rawState, action);
  },
});

export const pokerDealStreetTool = defineTool({
  name: 'poker_deal_street',
  description: 'Deals next street community cards (FLOP, TURN, RIVER) and resets street wagering.',
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
    },
  },
  execute: async (args: any, ctx: any) => {
    const rawState = (args?.state || ctx?.state?.gameState || ctx?.context?.gameState) as PokerGameState;
    return dealPokerStreet(rawState);
  },
});

export const pokerFastForwardBoardTool = defineTool({
  name: 'poker_fast_forward_board',
  description: 'Deals all remaining board cards when players are all-in.',
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
    },
  },
  execute: async (args: any, ctx: any) => {
    const rawState = (args?.state || ctx?.state?.gameState || ctx?.context?.gameState) as PokerGameState;
    return fastForwardPokerBoard(rawState);
  },
});

export const pokerDistributePotsTool = defineTool({
  name: 'poker_distribute_pots',
  description: 'Adjudicates showdown hands, allocates main and side pots, and settles chip counts.',
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
    },
  },
  execute: async (args: any, ctx: any) => {
    const rawState = (args?.state || ctx?.state?.gameState || ctx?.context?.gameState) as PokerGameState;
    return distributePokerPots(rawState);
  },
});

export const pokerRotateDealerTool = defineTool({
  name: 'poker_rotate_dealer',
  description: 'Rotates dealer button to next active seat.',
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
    },
  },
  execute: async (args: any, ctx: any) => {
    const rawState = (args?.state || ctx?.state?.gameState || ctx?.context?.gameState) as PokerGameState;
    return rotatePokerDealer(rawState);
  },
});

export const pokerHumanSpeechTool = defineTool({
  name: 'poker_human_speech',
  description: 'Applies human table talk, banter, or private whisper to the table and triggers AI persona reactions.',
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
      speechAct: { type: 'string', enum: ['TABLE_TALK', 'BANTER', 'WHISPER', 'PROVOKE'] },
      text: { type: 'string' },
      targetId: { type: 'string' },
      speakerId: { type: 'string' },
      speakerName: { type: 'string' },
    },
    required: ['speechAct', 'text'],
  },
  execute: async (args: any, ctx: any) => {
    const rawState = (args?.state || ctx?.state?.gameState || ctx?.context?.gameState) as PokerGameState;
    return processHumanSpeech(rawState, args);
  },
});

export const pokerCheckGameOverTool = defineTool({
  name: 'poker_check_game_over',
  description: 'Checks if table is down to 1 solvent player or reached max hands, compiling final standings.',
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
    },
  },
  execute: async (args: any, ctx: any) => {
    const rawState = (args?.state || ctx?.state?.gameState || ctx?.context?.gameState) as PokerGameState;
    return checkPokerGameOver(rawState);
  },
});

export const pokerGetStandingsTool = defineTool({
  name: 'poker_get_standings',
  description: 'Returns the current session standings and chip profit/loss report.',
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
    },
  },
  execute: async (args: any, ctx: any) => {
    const rawState = (args?.state || ctx?.state?.gameState || ctx?.context?.gameState) as PokerGameState;
    return getPokerStandings(rawState);
  },
});

export const pokerGetChoicesTool = defineTool({
  name: 'poker_get_choices',
  description: 'Calculates the dynamically allowed legal choices and actions for a player based on table rules',
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
      playerIdx: { type: 'number' },
    },
    required: ['state'],
  },
  execute: async (args: any, ctx: any) => {
    const rawState = (args?.state || ctx?.state?.gameState || ctx?.context?.gameState) as PokerGameState;
    return { choices: getLegalChoices(rawState, args?.playerIdx) };
  },
});

// ----------------------------------------------------------------------------
// Curator Poker Plugin Definition
// ----------------------------------------------------------------------------

export const pokerListTablesTool = defineTool({
  name: 'poker_list_tables',
  description: 'Lists all available poker tables in the project.',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async (_args: any, ctx: any) => {
    const prisma = ctx?.toolContext?.prisma || ctx?.prisma;
    if (!prisma?.conversation) return { tables: [] };
    const convs = await prisma.conversation.findMany({
      orderBy: { id: 'asc' },
    });
    const tables = convs.map((c: any) => ({
      id: String(c.id),
      tableId: String(c.id),
      title: c.metadata?.tableName || c.title || `Table #${c.id}`,
    }));
    return { tables };
  },
});

export const pokerPlugin: CuratorPlugin = {
  name: 'minigame:poker',
  version: '2.0.0',
  description: 'Curator Texas Holdem Engine with Autonomous Agent Flow, Side Pots, and Dual-Track Ambient Dialogue',
  tools: {
    poker_init_lobby: pokerInitLobbyTool,
    poker_join_lobby: pokerJoinLobbyTool,
    poker_leave_lobby: pokerLeaveLobbyTool,
    poker_list_tables: pokerListTablesTool,
    poker_start_hand: pokerStartHandTool,
    poker_ai_decision: pokerAiDecisionTool,
    poker_apply_action: pokerApplyActionTool,
    poker_deal_street: pokerDealStreetTool,
    poker_fast_forward_board: pokerFastForwardBoardTool,
    poker_distribute_pots: pokerDistributePotsTool,
    poker_rotate_dealer: pokerRotateDealerTool,
    poker_human_speech: pokerHumanSpeechTool,
    poker_check_game_over: pokerCheckGameOverTool,
    poker_get_standings: pokerGetStandingsTool,
    poker_get_choices: pokerGetChoicesTool,
  },
  scripts: loadPokerScriptSources(),
  agents: {
    hero: {
      id: 'hero',
      name: 'You (Hero)',
      scriptName: 'human_turn',
      schedule: 'manual',
      enabled: true,
      instruction: 'You are the human player (Hero) at the high-roller poker table.',
      persona: 'human',
      isHuman: true,
    },
    viper: {
      id: 'viper',
      name: 'Viper (Shark)',
      scriptName: 'agent_turn',
      schedule: 'manual',
      enabled: true,
      instruction: "You are Viper, a ruthless and mathematically calculating poker shark at a high-stakes Texas Hold'em table. Your tone is cool, precise, psychological, and dismissive of emotional play. You never reveal your exact hole cards. When speaking, you comment on pot odds, variance, and the foolishness of loose play.",
      persona: 'shark',
    },
    maddog: {
      id: 'maddog',
      name: 'MadDog (Maniac)',
      scriptName: 'agent_turn',
      schedule: 'manual',
      enabled: true,
      instruction: 'You are MadDog, a wild and loud poker maniac. You play loose, love bluffing, and shove chips into the middle for maximum adrenaline. Your tone is boisterous, confrontational, taunting, and energetic. Trash-talk, dare people to call, and embrace chaos.',
      persona: 'maniac',
    },
    barnaby: {
      id: 'barnaby',
      name: 'Barnaby (Station)',
      scriptName: 'agent_turn',
      schedule: 'manual',
      enabled: true,
      instruction: 'You are Barnaby, an affable, folksy, and warm calling station. You love chatting at the table, hate folding, and always wonder what the next card will bring. Your tone is grandfatherly, cheerful, gentle, and humorous.',
      persona: 'station',
    },
  } as any,
};
