import {
  defineTool,
  type CuratorPlugin,
  type CuratorScriptDefinition,
  CuratorSystemRole,
  CuratorAccessLevel,
} from '../curator.ts';
import {
  PokerModule,
  PokerTool,
  PokerRole,
  PokerEvent,
  PokerToolAlias,
  PokerToolUsage,
  type PokerInitLobbyParams,
  type PokerJoinLobbyParams,
  type PokerLeaveLobbyParams,
  type PokerStartHandParams,
  type PokerAiDecisionParams,
  type PokerApplyActionParams,
  type PokerDealStreetParams,
  type PokerFastForwardParams,
  type PokerDistributePotsParams,
  type PokerRotateDealerParams,
  type PokerHumanSpeechParams,
  type PokerCheckGameOverParams,
  type PokerGetStandingsParams,
  type PokerGetChoicesParams,
  type PokerListTablesParams,
} from '../composables/pokerComposables.ts';
import { POKER_WORKFLOW_ASTS } from '../workflows/index.ts';
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
import { POKER_AGENT_PROFILES } from '../engine/agentProfiles.ts';

const SCRIPT_DESCRIPTIONS: Record<string, string> = {
  [PokerModule.WORKFLOW]: 'Texas Holdem master game loop and table manager AST workflow',
  [PokerModule.LOBBY]: 'Texas Holdem lounge concierge and table seating AST workflow',
  [PokerModule.HUMAN_TURN]: 'Human player turn handler AST workflow',
  [PokerModule.AGENT_TURN]: 'AI Agent turn handler AST workflow',
  [PokerModule.ACTION]: 'Player action event distributor AST workflow',
  [PokerModule.AMBIENT_REACTION]: 'Table spectator chatter and ambient reaction AST workflow',
};

/**
 * Pre-compiled typed TypeScript workflow AST definitions for Texas Hold'em.
 * Synced automatically with canonical POKER_WORKFLOW_ASTS.
 */
export const pokerScripts: Record<string, CuratorScriptDefinition> = Object.fromEntries(
  Object.entries(POKER_WORKFLOW_ASTS).map(([name, ast]) => [
    name,
    {
      name,
      description: SCRIPT_DESCRIPTIONS[name] || `Texas Holdem AST workflow for ${name}`,
      ast,
      run: async () => {},
    },
  ])
);

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function extractGameState(args: any, ctx: any): PokerGameState {
  return (args?.state || ctx?.state?.gameState || ctx?.context?.gameState) as PokerGameState;
}

// ----------------------------------------------------------------------------
// Curator Tool Registrations
// ----------------------------------------------------------------------------

export const pokerInitLobbyTool = defineTool<PokerInitLobbyParams>({
  name: PokerTool.INIT_LOBBY,
  description: 'Initializes Texas Holdem lobby frame. Can accept dynamic initial players or start as an open table.',
  requiredRole: PokerRole.DEALER,
  accessLevel: CuratorAccessLevel.SAFE_WRITE,
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
  execute: async (args: PokerInitLobbyParams) => {
    return initPokerLobby(args);
  },
});

export const pokerJoinLobbyTool = defineTool<PokerJoinLobbyParams>({
  name: PokerTool.JOIN_LOBBY,
  description: 'Dynamically seats an actor at the poker table with their wallet / buy-in.',
  usage: PokerToolUsage.JOIN_LOBBY,
  requiredRole: PokerRole.PLAYER,
  accessLevel: CuratorAccessLevel.SAFE_WRITE,
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
  execute: async (args: PokerJoinLobbyParams, ctx: any) => {
    const rawState = extractGameState(args, ctx);
    const pData = args?.player || args;
    return joinPokerLobby(rawState, pData);
  },
});

export const pokerLeaveLobbyTool = defineTool<PokerLeaveLobbyParams>({
  name: PokerTool.LEAVE_LOBBY,
  description: 'Removes or cashes out an actor from the poker table.',
  usage: PokerToolUsage.LEAVE_LOBBY,
  requiredRole: PokerRole.PLAYER,
  accessLevel: CuratorAccessLevel.SAFE_WRITE,
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
      id: { type: 'string' },
    },
    required: ['id'],
  },
  execute: async (args: PokerLeaveLobbyParams, ctx: any) => {
    const rawState = extractGameState(args, ctx);
    const id = String(args.id);
    return leavePokerLobby(rawState, id);
  },
});

export const pokerStartHandTool = defineTool<PokerStartHandParams>({
  name: PokerTool.START_HAND,
  description: 'Starts a new hand: shuffles deck, posts blinds, deals hole cards.',
  requiredRole: PokerRole.DEALER,
  accessLevel: CuratorAccessLevel.SAFE_WRITE,
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
    },
  },
  execute: async (args: PokerStartHandParams, ctx: any) => {
    const rawState = extractGameState(args, ctx);
    return startPokerHand(rawState);
  },
});

export const pokerAiDecisionTool = defineTool<PokerAiDecisionParams>({
  name: PokerTool.AI_DECISION,
  description: 'Calculates AI player action and ambient remark via Curator Agentic Engine.',
  requiredRole: PokerRole.PLAYER,
  accessLevel: CuratorAccessLevel.SAFE_READ,
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
      playerIdx: { type: 'number' },
    },
  },
  execute: async (args: PokerAiDecisionParams, ctx: any) => {
    const rawState = extractGameState(args, ctx);
    const idx = typeof args?.playerIdx === 'number' ? args.playerIdx : rawState.activePlayerIdx;
    const player = rawState.players[idx];

    const action = await agenticDecidePokerAction(player, rawState);
    return { action };
  },
});

export const pokerApplyActionTool = defineTool<PokerApplyActionParams>({
  name: PokerTool.APPLY_ACTION,
  description: 'Applies player action (FOLD, CHECK, CALL, RAISE <amount>, ALL_IN) to table state.',
  usage: PokerToolUsage.APPLY_ACTION,
  aliases: [PokerToolAlias.ACT],
  requiredRole: PokerRole.PLAYER,
  accessLevel: CuratorAccessLevel.SAFE_WRITE,
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
      action: { type: 'object' },
    },
  },
  execute: async (args: PokerApplyActionParams, ctx: any) => {
    const rawState = extractGameState(args, ctx);
    const action = (args?.action || ctx?.context?.lastAction || { type: 'CHECK' }) as PlayerAction;
    return applyPokerAction(rawState, action);
  },
});

export const pokerDealStreetTool = defineTool<PokerDealStreetParams>({
  name: PokerTool.DEAL_STREET,
  description: 'Deals next street community cards (FLOP, TURN, RIVER) and resets street wagering.',
  requiredRole: PokerRole.DEALER,
  accessLevel: CuratorAccessLevel.SAFE_WRITE,
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
    },
  },
  execute: async (args: PokerDealStreetParams, ctx: any) => {
    const rawState = extractGameState(args, ctx);
    return dealPokerStreet(rawState);
  },
});

export const pokerFastForwardBoardTool = defineTool<PokerFastForwardParams>({
  name: PokerTool.FAST_FORWARD,
  description: 'Deals all remaining board cards when players are all-in.',
  requiredRole: PokerRole.DEALER,
  accessLevel: CuratorAccessLevel.SAFE_WRITE,
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
    },
  },
  execute: async (args: PokerFastForwardParams, ctx: any) => {
    const rawState = extractGameState(args, ctx);
    return fastForwardPokerBoard(rawState);
  },
});

export const pokerDistributePotsTool = defineTool<PokerDistributePotsParams>({
  name: PokerTool.DISTRIBUTE_POTS,
  description: 'Adjudicates showdown hands, allocates main and side pots, and settles chip counts.',
  requiredRole: PokerRole.DEALER,
  accessLevel: CuratorAccessLevel.SAFE_WRITE,
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
    },
  },
  execute: async (args: PokerDistributePotsParams, ctx: any) => {
    const rawState = extractGameState(args, ctx);
    return distributePokerPots(rawState);
  },
});

export const pokerRotateDealerTool = defineTool<PokerRotateDealerParams>({
  name: PokerTool.ROTATE_DEALER,
  description: 'Rotates dealer button to next active seat.',
  requiredRole: PokerRole.DEALER,
  accessLevel: CuratorAccessLevel.SAFE_WRITE,
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
    },
  },
  execute: async (args: PokerRotateDealerParams, ctx: any) => {
    const rawState = extractGameState(args, ctx);
    return rotatePokerDealer(rawState);
  },
});

export const pokerHumanSpeechTool = defineTool<PokerHumanSpeechParams>({
  name: PokerTool.HUMAN_SPEECH,
  description: 'Applies human table talk, banter, or private whisper to the table and triggers AI persona reactions.',
  usage: PokerToolUsage.HUMAN_SPEECH,
  aliases: [PokerToolAlias.SPEECH],
  requiredRole: PokerRole.PLAYER,
  accessLevel: CuratorAccessLevel.SAFE_READ,
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
  execute: async (args: PokerHumanSpeechParams, ctx: any) => {
    const rawState = extractGameState(args, ctx);
    return processHumanSpeech(rawState, args, ctx);
  },
});

export const pokerCheckGameOverTool = defineTool<PokerCheckGameOverParams>({
  name: PokerTool.CHECK_GAME_OVER,
  description: 'Checks if table is down to 1 solvent player or reached max hands, compiling final standings.',
  requiredRole: PokerRole.DEALER,
  accessLevel: CuratorAccessLevel.SAFE_WRITE,
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
    },
  },
  execute: async (args: PokerCheckGameOverParams, ctx: any) => {
    const rawState = extractGameState(args, ctx);
    return checkPokerGameOver(rawState);
  },
});

export const pokerGetStandingsTool = defineTool<PokerGetStandingsParams>({
  name: PokerTool.GET_STANDINGS,
  description: 'Returns the current session standings and chip profit/loss report.',
  aliases: [PokerToolAlias.STANDINGS],
  requiredRole: PokerRole.SPECTATOR,
  accessLevel: CuratorAccessLevel.SAFE_READ,
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
    },
  },
  execute: async (args: PokerGetStandingsParams, ctx: any) => {
    const rawState = extractGameState(args, ctx);
    if (!rawState || !rawState.players) {
      return { standings: [], message: 'No active table game state found. Table may be in lobby or paused.' };
    }
    return getPokerStandings(rawState);
  },
});

export const pokerGetChoicesTool = defineTool<PokerGetChoicesParams>({
  name: PokerTool.GET_CHOICES,
  description: 'Calculates the dynamically allowed legal choices and actions for a player based on table rules',
  usage: PokerToolUsage.GET_CHOICES,
  requiredRole: PokerRole.SPECTATOR,
  accessLevel: CuratorAccessLevel.SAFE_READ,
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
      playerIdx: { type: 'number' },
    },
    required: ['state'],
  },
  execute: async (args: PokerGetChoicesParams, ctx: any) => {
    const rawState = extractGameState(args, ctx);
    if (!rawState) {
      return { choices: [], message: 'No active table game state found. Table may be in lobby or paused.' };
    }
    const idx = typeof args?.playerIdx === 'number' ? args.playerIdx : undefined;
    return { choices: getLegalChoices(rawState, idx) };
  },
});

export const pokerListTablesTool = defineTool<PokerListTablesParams>({
  name: PokerTool.LIST_TABLES,
  description: 'Lists all available poker tables in the project.',
  aliases: [PokerToolAlias.LIST_TABLES],
  requiredRole: PokerRole.SPECTATOR,
  accessLevel: CuratorAccessLevel.SAFE_READ,
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async (_args: PokerListTablesParams, ctx: any) => {
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
      event: PokerEvent.TABLE_SELECTED,
      payload: { id: String(t.id) },
      value: { id: String(t.id) },
    }));
    return { tables, choices };
  },
});

// ----------------------------------------------------------------------------
// Curator Poker Plugin Definition
// ----------------------------------------------------------------------------

export const pokerToolsList = [
  pokerInitLobbyTool,
  pokerJoinLobbyTool,
  pokerLeaveLobbyTool,
  pokerListTablesTool,
  pokerStartHandTool,
  pokerAiDecisionTool,
  pokerApplyActionTool,
  pokerDealStreetTool,
  pokerFastForwardBoardTool,
  pokerDistributePotsTool,
  pokerRotateDealerTool,
  pokerHumanSpeechTool,
  pokerCheckGameOverTool,
  pokerGetStandingsTool,
  pokerGetChoicesTool,
];

export const pokerTools = Object.assign(
  pokerToolsList,
  Object.fromEntries(pokerToolsList.map((t) => [t.name, t]))
);

export const pokerPlugin: CuratorPlugin = {
  name: 'minigame:poker',
  version: '2.0.0',
  description: 'Curator Texas Holdem Engine with Autonomous Agent Flow, Side Pots, and Dual-Track Ambient Dialogue',
  roles: {
    [PokerRole.ADMIN]: {
      name: PokerRole.ADMIN,
      description: 'Poker Lounge Administrator with unrestricted table controls and configuration privileges',
      subRoles: [PokerRole.DEALER],
    },
    [PokerRole.DEALER]: {
      name: PokerRole.DEALER,
      description: 'Table Dealer responsible for deck management, dealing cards, and pot settlements',
      subRoles: [PokerRole.PLAYER],
      tools: [
        PokerTool.INIT_LOBBY,
        PokerTool.START_HAND,
        PokerTool.DEAL_STREET,
        PokerTool.FAST_FORWARD,
        PokerTool.DISTRIBUTE_POTS,
        PokerTool.ROTATE_DEALER,
        PokerTool.CHECK_GAME_OVER,
      ],
    },
    [PokerRole.PLAYER]: {
      name: PokerRole.PLAYER,
      description: 'Active seated player eligible to wager chips and engage in table banter',
      subRoles: [PokerRole.SPECTATOR],
      tools: [
        PokerTool.JOIN_LOBBY,
        PokerTool.LEAVE_LOBBY,
        PokerTool.APPLY_ACTION,
        PokerTool.AI_DECISION,
        PokerTool.HUMAN_SPEECH,
      ],
    },
    [PokerRole.SPECTATOR]: {
      name: PokerRole.SPECTATOR,
      description: 'Spectator observing table action, discovery, and leaderboard standings',
      tools: [
        PokerTool.LIST_TABLES,
        PokerTool.GET_CHOICES,
        PokerTool.GET_STANDINGS,
      ],
    },
  },
  defaultUserRoles: [PokerRole.PLAYER, PokerRole.SPECTATOR],
  systemRoles: [
    CuratorSystemRole.ADMIN,
    PokerRole.ADMIN,
    PokerRole.DEALER,
    PokerRole.PLAYER,
    PokerRole.SPECTATOR,
  ],
  tools: pokerTools,
  scripts: pokerScripts,
  agents: Object.fromEntries(
    Object.entries(POKER_AGENT_PROFILES).map(([key, profile]) => [
      key,
      {
        ...profile,
        ...(profile.scriptName && POKER_WORKFLOW_ASTS[profile.scriptName]
          ? { ast: POKER_WORKFLOW_ASTS[profile.scriptName] }
          : {}),
      },
    ])
  ) as any,
};
