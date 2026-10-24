import { defineTool, type CuratorPlugin, type CuratorScriptDefinition } from '../curator.ts';
import '../composables/pokerComposables.ts';
import {
  pokerWorkflowAst,
  pokerLobbyAst,
  humanTurnAst,
  agentTurnAst,
  pokerActionAst,
  ambientReactionAst,
} from '../workflows/index.ts';
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

/**
 * Pre-compiled typed TypeScript workflow AST definitions for Texas Hold'em.
 */
export const pokerScripts: Record<string, CuratorScriptDefinition> = {
  poker_workflow: {
    name: 'poker_workflow',
    description: 'Texas Holdem master game loop and table manager AST workflow',
    ast: pokerWorkflowAst,
    run: async () => {},
  },
  poker_lobby: {
    name: 'poker_lobby',
    description: 'Texas Holdem lounge concierge and table seating AST workflow',
    ast: pokerLobbyAst,
    run: async () => {},
  },
  human_turn: {
    name: 'human_turn',
    description: 'Human player turn handler AST workflow',
    ast: humanTurnAst,
    run: async () => {},
  },
  agent_turn: {
    name: 'agent_turn',
    description: 'AI Agent turn handler AST workflow',
    ast: agentTurnAst,
    run: async () => {},
  },
  poker_action: {
    name: 'poker_action',
    description: 'Player action event distributor AST workflow',
    ast: pokerActionAst,
    run: async () => {},
  },
  ambient_reaction: {
    name: 'ambient_reaction',
    description: 'Table spectator chatter and ambient reaction AST workflow',
    ast: ambientReactionAst,
    run: async () => {},
  },
};

// Re-export domain logic for consumer backwards-compatibility
export * from '../engine/pokerEngine.ts';

// ----------------------------------------------------------------------------
// Curator Tool Registrations
// ----------------------------------------------------------------------------

export const pokerInitLobbyTool = defineTool({
  name: 'poker_init_lobby',
  description: 'Initializes Texas Holdem lobby frame. Can accept dynamic initial players or start as an open table.',
  requiredRole: 'poker:dealer',
  accessLevel: 'safe_write',
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
  description: 'Dynamically seats an actor at the poker table with their wallet / buy-in.',
  usage: '<actorId> <name> [chips] [seatIdx]',
  requiredRole: 'poker:player',
  accessLevel: 'safe_write',
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
  description: 'Removes or cashes out an actor from the poker table.',
  usage: '<actorId>',
  requiredRole: 'poker:player',
  accessLevel: 'safe_write',
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
  requiredRole: 'poker:dealer',
  accessLevel: 'safe_write',
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
  requiredRole: 'poker:player',
  accessLevel: 'safe_read',
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
  description: 'Applies player action (FOLD, CHECK, CALL, RAISE <amount>, ALL_IN) to table state.',
  usage: '<actionType> [amount]',
  aliases: ['act'],
  requiredRole: 'poker:player',
  accessLevel: 'safe_write',
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
  requiredRole: 'poker:dealer',
  accessLevel: 'safe_write',
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
  requiredRole: 'poker:dealer',
  accessLevel: 'safe_write',
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
  requiredRole: 'poker:dealer',
  accessLevel: 'safe_write',
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
  requiredRole: 'poker:dealer',
  accessLevel: 'safe_write',
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
  usage: '<speak|whisper|message> [actor] <text>',
  aliases: ['speech'],
  requiredRole: 'poker:player',
  accessLevel: 'safe_read',
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
    return processHumanSpeech(rawState, args, ctx);
  },
});

export const pokerCheckGameOverTool = defineTool({
  name: 'poker_check_game_over',
  description: 'Checks if table is down to 1 solvent player or reached max hands, compiling final standings.',
  requiredRole: 'poker:dealer',
  accessLevel: 'safe_write',
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
  aliases: ['standings_tool'],
  requiredRole: 'poker:spectator',
  accessLevel: 'safe_read',
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
    },
  },
  execute: async (args: any, ctx: any) => {
    const rawState = (args?.state || ctx?.state?.gameState || ctx?.context?.gameState) as PokerGameState;
    if (!rawState || !rawState.players) {
      return { standings: [], message: 'No active table game state found. Table may be in lobby or paused.' };
    }
    return getPokerStandings(rawState);
  },
});

export const pokerGetChoicesTool = defineTool({
  name: 'poker_get_choices',
  description: 'Calculates the dynamically allowed legal choices and actions for a player based on table rules',
  usage: '[playerIdx]',
  requiredRole: 'poker:spectator',
  accessLevel: 'safe_read',
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
    if (!rawState) {
      return { choices: [], message: 'No active table game state found. Table may be in lobby or paused.' };
    }
    return { choices: getLegalChoices(rawState, args?.playerIdx) };
  },
});

// ----------------------------------------------------------------------------
// Curator Poker Plugin Definition
// ----------------------------------------------------------------------------

export const pokerListTablesTool = defineTool({
  name: 'poker_list_tables',
  description: 'Lists all available poker tables in the project.',
  aliases: ['list_tables'],
  requiredRole: 'poker:spectator',
  accessLevel: 'safe_read',
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
    const choices = tables.map((t: any, idx: number) => ({
      id: String(t.id),
      label: `Table #${t.id} (${t.title})`,
      aliases: [String(idx + 1), String(t.id)],
      event: 'poker:table_selected',
      payload: { id: String(t.id) },
      value: { id: String(t.id) },
    }));
    return { tables, choices };
  },
});

export const pokerPlugin: CuratorPlugin = {
  name: 'minigame:poker',
  version: '2.0.0',
  description: 'Curator Texas Holdem Engine with Autonomous Agent Flow, Side Pots, and Dual-Track Ambient Dialogue',
  roles: {
    'poker:admin': {
      name: 'poker:admin',
      description: 'Poker Lounge Administrator with unrestricted table controls and configuration privileges',
      subRoles: ['poker:dealer'],
    },
    'poker:dealer': {
      name: 'poker:dealer',
      description: 'Table Dealer responsible for deck management, dealing cards, and pot settlements',
      subRoles: ['poker:player'],
      tools: [
        'poker_init_lobby',
        'poker_start_hand',
        'poker_deal_street',
        'poker_fast_forward_board',
        'poker_distribute_pots',
        'poker_rotate_dealer',
        'poker_check_game_over',
      ],
    },
    'poker:player': {
      name: 'poker:player',
      description: 'Active seated player eligible to wager chips and engage in table banter',
      subRoles: ['poker:spectator'],
      tools: [
        'poker_join_lobby',
        'poker_leave_lobby',
        'poker_apply_action',
        'poker_ai_decision',
        'poker_human_speech',
      ],
    },
    'poker:spectator': {
      name: 'poker:spectator',
      description: 'Spectator observing table action, discovery, and leaderboard standings',
      tools: [
        'poker_list_tables',
        'poker_get_choices',
        'poker_get_standings',
      ],
    },
  },
  defaultUserRoles: ['poker:player', 'poker:spectator'],
  systemRoles: ['system:admin', 'poker:admin', 'poker:dealer', 'poker:player', 'poker:spectator'],
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
  scripts: pokerScripts,
  agents: {
    hero: {
      id: 'hero',
      name: 'You (Hero)',
      scriptName: 'human_turn',
      ast: humanTurnAst,
      schedule: 'manual',
      enabled: true,
      instruction: 'You are the human player (Hero) at the high-roller poker table.',
      persona: 'human',
      isHuman: true,
      roles: ['poker:player', 'poker:spectator'],
    },
    lobby: {
      id: 'lobby',
      name: 'Lobby (Concierge)',
      scriptName: 'poker_lobby',
      ast: pokerLobbyAst,
      schedule: 'manual',
      enabled: true,
      instruction: "You are the Texas Hold'em Lounge Concierge. You welcome players to the poker lounge, explain available tables and game formats, assist with table seating, buy-ins, and direct players to active games.",
      persona: 'concierge',
      roles: ['poker:admin', 'poker:spectator'],
    },
    dealer: {
      id: 'dealer',
      name: 'Dealer (House)',
      scriptName: 'poker_workflow',
      ast: pokerWorkflowAst,
      schedule: 'manual',
      enabled: true,
      instruction: "You are the professional Texas Hold'em table dealer. You run the table, deal community cards, announce pot amounts and street actions, and answer table inquiries politely and authoritatively.",
      persona: 'dealer',
      roles: ['poker:dealer', 'poker:spectator'],
    },
    viper: {
      id: 'viper',
      name: 'Viper (Shark)',
      scriptName: 'agent_turn',
      ast: agentTurnAst,
      schedule: 'manual',
      enabled: true,
      instruction: "You are Viper, a ruthless and mathematically calculating poker shark at a high-stakes Texas Hold'em table. Your tone is cool, precise, psychological, and dismissive of emotional play. You never reveal your exact hole cards. When speaking, you comment on pot odds, variance, and the foolishness of loose play.",
      persona: 'shark',
      roles: ['poker:player', 'poker:spectator', 'agent:reader'],
    },
    maddog: {
      id: 'maddog',
      name: 'MadDog (Maniac)',
      scriptName: 'agent_turn',
      ast: agentTurnAst,
      schedule: 'manual',
      enabled: true,
      instruction: 'You are MadDog, a wild and loud poker maniac. You play loose, love bluffing, and shove chips into the middle for maximum adrenaline. Your tone is boisterous, confrontational, taunting, and energetic. Trash-talk, dare people to call, and embrace chaos.',
      persona: 'maniac',
      roles: ['poker:player', 'poker:spectator', 'agent:reader'],
    },
    barnaby: {
      id: 'barnaby',
      name: 'Barnaby (Station)',
      scriptName: 'agent_turn',
      ast: agentTurnAst,
      schedule: 'manual',
      enabled: true,
      instruction: 'You are Barnaby, an affable, folksy, and warm calling station. You love chatting at the table, hate folding, and always wonder what the next card will bring. Your tone is grandfatherly, cheerful, gentle, and humorous.',
      persona: 'station',
      roles: ['poker:player', 'poker:spectator', 'agent:reader'],
    },
  } as any,
};
