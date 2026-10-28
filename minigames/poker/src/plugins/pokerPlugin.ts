import {
  defineTool,
  type CuratorPlugin,
  type CuratorScriptDefinition,
  type CuratorToolAccessLevel,
  CuratorSystemRole,
  CuratorAccessLevel,
} from '../curator.ts';
import {
  PokerModule,
  PokerTool,
  type PokerToolType,
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
  type PokerLobbyMenuParams,
  type PokerCreateTableParams,
  buildLobbyMenu,
  type PokerGetBankrollParams,
  type PokerGetBuyInOptionsParams,
  type PokerDepositBuyInParams,
  type PokerCashOutParams,
  type PokerReloadBankrollParams,
  type PokerCloseTableParams,
} from '../models/index.ts';
import { POKER_WORKFLOW_ASTS } from '../workflows/index.ts';
import {
  closePokerLobbyConversation,
  closePokerGameTable,
  parseConversationMetadata,
} from '../session/pokerSession.ts';
import type { PokerGameState, PlayerAction } from '../types.ts';
import {
  initPokerLobby,
  joinPokerLobby,
  leavePokerLobby,
  startPokerHand,
  applyPokerAction,
  dealPokerStreet,
  fastForwardPokerBoard,
  distributePokerPots,
  rotatePokerDealer,
  checkPokerGameOver,
  getPokerStandings,
  getLegalChoices,
} from '../engine/pokerEngine.ts';
import { PokerSpeechAct } from '../models/index.ts';
import { PokerTableShape, PokerBankrollShape } from '../models/pokerShapes.ts';
import { queryActivePokerTables, pokerTableProjector } from '../services/pokerTableStore.ts';
import {
  getOrCreateBankroll,
  depositBuyIn,
  cashOutToBankroll,
  reloadBankroll,
  getBuyInPresets,
  getBuyInLimits,
  parseChipAmount,
} from '../services/pokerBankrollStore.ts';
import { POKER_AGENT_PROFILES } from '../workflows/agentProfiles.ts';

const SCRIPT_DESCRIPTIONS: Record<string, string> = {
  [PokerModule.WORKFLOW]: 'Texas Holdem master game loop and table manager AST workflow',
  [PokerModule.LOBBY]: 'Texas Holdem lounge concierge and table seating AST workflow',
  [PokerModule.PLAYER_TURN]: 'Universal Texas Holdem player turn AST workflow',
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
  return (args?.state || ctx?.state?.gameState) as PokerGameState;
}

// ----------------------------------------------------------------------------
// Curator Tool Registrations
// ----------------------------------------------------------------------------

function defineStateTool<T = any>(
  name: string,
  description: string,
  requiredRole: string,
  handler: (state: PokerGameState, args: any, ctx: any) => any,
  options: {
    accessLevel?: CuratorToolAccessLevel;
    aliases?: string[];
    usage?: string;
    properties?: Record<string, any>;
    required?: string[];
  } = {}
) {
  return defineTool<T>({
    name,
    description,
    requiredRole,
    accessLevel: options.accessLevel || CuratorAccessLevel.SAFE_WRITE,
    aliases: options.aliases,
    usage: options.usage,
    parameters: {
      type: 'object',
      properties: {
        state: { type: 'object' },
        ...(options.properties || {}),
      },
      required: options.required,
    },
    execute: async (args: any, ctx: any) => {
      const state = extractGameState(args, ctx);
      return handler(state, args, ctx);
    },
  });
}

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

export const pokerJoinLobbyTool = defineStateTool<PokerJoinLobbyParams>(
  PokerTool.JOIN_LOBBY,
  'Dynamically seats an actor at the poker table with their wallet / buy-in.',
  PokerRole.PLAYER,
  (rawState, args) => joinPokerLobby(rawState, args?.player || args),
  {
    usage: PokerToolUsage.JOIN_LOBBY,
    properties: {
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
  }
);

export const pokerLeaveLobbyTool = defineStateTool<PokerLeaveLobbyParams>(
  PokerTool.LEAVE_LOBBY,
  'Removes or cashes out an actor from the poker table.',
  PokerRole.PLAYER,
  (rawState, args) => leavePokerLobby(rawState, String(args.id)),
  {
    usage: PokerToolUsage.LEAVE_LOBBY,
    properties: {
      id: { type: 'string' },
    },
    required: ['id'],
  }
);

export const pokerStartHandTool = defineStateTool<PokerStartHandParams>(
  PokerTool.START_HAND,
  'Starts a new hand: shuffles deck, posts blinds, deals hole cards.',
  PokerRole.DEALER,
  (s) => startPokerHand(s),
);


export const pokerApplyActionTool = defineStateTool<PokerApplyActionParams>(
  PokerTool.APPLY_ACTION,
  'Applies player action (FOLD, CHECK, CALL, RAISE <amount>, ALL_IN) to table state.',
  PokerRole.PLAYER,
  (s, args, ctx) => {
    let action = (args?.action || ctx?.context?.turnAction || ctx?.context?.action || ctx?.context?.lastAction || { type: 'CHECK' }) as any;
    if (typeof action === 'string' && (action.startsWith('$') || action.includes('$context'))) {
      action = ctx?.context?.turnAction || ctx?.context?.action || ctx?.context?.lastAction || { type: 'CHECK' };
    }
    return applyPokerAction(s, action);
  },
  {
    usage: PokerToolUsage.APPLY_ACTION,
    aliases: [PokerToolAlias.ACT],
    properties: { action: { type: 'object' } },
  },
);

export const pokerDealStreetTool = defineStateTool<PokerDealStreetParams>(
  PokerTool.DEAL_STREET,
  'Deals next street community cards (FLOP, TURN, RIVER) and resets street wagering.',
  PokerRole.DEALER,
  (s) => dealPokerStreet(s),
);

export const pokerFastForwardBoardTool = defineStateTool<PokerFastForwardParams>(
  PokerTool.FAST_FORWARD,
  'Deals all remaining board cards when players are all-in.',
  PokerRole.DEALER,
  (s) => fastForwardPokerBoard(s),
);

export const pokerDistributePotsTool = defineStateTool<PokerDistributePotsParams>(
  PokerTool.DISTRIBUTE_POTS,
  'Adjudicates showdown hands, allocates main and side pots, and settles chip counts.',
  PokerRole.DEALER,
  (s) => distributePokerPots(s),
);

export const pokerRotateDealerTool = defineStateTool<PokerRotateDealerParams>(
  PokerTool.ROTATE_DEALER,
  'Rotates dealer button to next active seat.',
  PokerRole.DEALER,
  (s) => rotatePokerDealer(s),
);

export const pokerHumanSpeechTool = defineStateTool<PokerHumanSpeechParams>(
  PokerTool.HUMAN_SPEECH,
  'Applies table talk, banter, gossip, or private whisper from any player and triggers AI persona reactions.',
  PokerRole.PLAYER,
  (rawState, args, ctx) => {
    const speakerId = args?.speakerId || ctx?.userId || ctx?.actorId || 'hero';
    const speakerName = args?.speakerName || ctx?.user?.name || speakerId;
    const remark = {
      speakerId,
      speakerName,
      speechAct: args?.speechAct || (args?.targetId ? PokerSpeechAct.WHISPER : PokerSpeechAct.TABLE_TALK),
      recipientId: args?.targetId ? String(args.targetId) : undefined,
      text: String(args?.text || ''),
      timestamp: Date.now(),
    };
    return { gameState: rawState, remark, aiResponse: null };
  },
  {
    accessLevel: CuratorAccessLevel.SAFE_READ,
    usage: PokerToolUsage.HUMAN_SPEECH,
    aliases: [PokerToolAlias.SPEECH, PokerTool.SPEECH],
    properties: {
      speechAct: { type: 'string' },
      text: { type: 'string' },
      targetId: { type: 'string' },
    },
    required: ['text'],
  }
);

export const pokerSpeechTool = pokerHumanSpeechTool;

export const pokerCheckGameOverTool = defineStateTool<PokerCheckGameOverParams>(
  PokerTool.CHECK_GAME_OVER,
  'Checks if table is down to 1 solvent player or reached max hands, compiling final standings.',
  PokerRole.DEALER,
  (s) => checkPokerGameOver(s),
);

export const pokerGetStandingsTool = defineStateTool<PokerGetStandingsParams>(
  PokerTool.GET_STANDINGS,
  'Returns the current session standings and chip profit/loss report.',
  PokerRole.SPECTATOR,
  (s) => (!s || !s.players ? { standings: [], message: 'No active table game state found. Table may be in lobby or paused.' } : getPokerStandings(s)),
  {
    accessLevel: CuratorAccessLevel.SAFE_READ,
    aliases: [PokerToolAlias.STANDINGS],
  },
);

export const pokerGetChoicesTool = defineStateTool<PokerGetChoicesParams>(
  PokerTool.GET_CHOICES,
  'Calculates the dynamically allowed legal choices and actions for a player based on table rules',
  PokerRole.SPECTATOR,
  (s, args) => (!s ? { choices: [], message: 'No active table game state found. Table may be in lobby or paused.' } : { choices: getLegalChoices(s, typeof args?.playerIdx === 'number' ? args.playerIdx : undefined) }),
  {
    accessLevel: CuratorAccessLevel.SAFE_READ,
    usage: PokerToolUsage.GET_CHOICES,
    properties: { playerIdx: { type: 'number' } },
  },
);

export const pokerListTablesTool = defineTool<PokerListTablesParams>({
  name: PokerTool.LIST_TABLES,
  description: 'Lists all available unfinished poker tables in the project for the current user.',
  aliases: [PokerToolAlias.LIST_TABLES],
  requiredRole: PokerRole.SPECTATOR,
  accessLevel: CuratorAccessLevel.SAFE_READ,
  parameters: { type: 'object', properties: {} },
  // Identity and project scope come only from the host session, never from tool args
  execute: async (_args: PokerListTablesParams, ctx: any) => {
    const host = ctx?.host;
    const reqCtx = (typeof ctx?.context === 'object' && ctx.context) || {};

    return queryActivePokerTables(ctx?.prisma, {
      projectId: String(ctx?.projectId || host?.project?.id || '').trim(),
      userId: String(ctx?.userId || host?.user?.id || '').trim(),
      playerName: String(reqCtx.playerName || host?.user?.name || '').trim(),
    });
  },
});

export const pokerLobbyMenuTool = defineTool<PokerLobbyMenuParams>({
  name: PokerTool.LOBBY_MENU,
  description: 'Builds the lounge menu (New / Resume / Exit) and table selection choices from a list of open tables.',
  requiredRole: PokerRole.SPECTATOR,
  accessLevel: CuratorAccessLevel.SAFE_READ,
  parameters: {
    type: 'object',
    properties: { tables: { type: 'array' } },
  },
  // Pure view: no I/O, same tables in -> same menu out
  execute: async (args: PokerLobbyMenuParams) => buildLobbyMenu(Array.isArray(args?.tables) ? args.tables : []),
});

export const pokerCreateTableTool = defineTool<PokerCreateTableParams>({
  name: PokerTool.CREATE_TABLE,
  description: 'Creates a new poker game table conversation with seated players.',
  requiredRole: PokerRole.SPECTATOR,
  accessLevel: CuratorAccessLevel.SAFE_WRITE,
  parameters: {
    type: 'object',
    properties: {
      tableName: { type: 'string' },
      playerName: { type: 'string' },
      startingChips: { type: 'number' },
      smallBlind: { type: 'number' },
      bigBlind: { type: 'number' },
      maxSeats: { type: 'number' },
    },
  },
  execute: async (args: PokerCreateTableParams, ctx: any) => {
    const host = ctx?.toolContext?.host || ctx?.host;
    if (host) {
      const { createPokerGameTable } = await import('../session/pokerSession.ts');
      const tableInfo = await createPokerGameTable(host, args as any);
      return { success: true, table: tableInfo, tableId: tableInfo.tableId };
    }
    const tableId = `poker:table_${crypto.randomUUID()}`;
    return { success: true, tableId, table: { title: args?.tableName || `Table #${tableId.slice(-6)}` } };
  },
});

/** Wallet tools act on the session user's bankroll only; identity never comes from args. */
function resolveWalletOwner(ctx: any): { prisma: any; userId: string; projectId?: string } {
  const host = ctx?.toolContext?.host || ctx?.host;
  const prisma = host?.prisma || ctx?.prisma;
  const userId = host?.user?.id;
  if (!prisma || !userId) {
    throw new Error('Bankroll tools require a host session with prisma and an authenticated user');
  }
  return { prisma, userId: String(userId), projectId: host?.project?.id };
}

export const pokerGetBankrollTool = defineTool<PokerGetBankrollParams>({
  name: PokerTool.GET_BANKROLL,
  description: "Retrieves the session user's persistent chip bankroll (wallet).",
  requiredRole: PokerRole.SPECTATOR,
  accessLevel: CuratorAccessLevel.READ_ONLY,
  parameters: { type: 'object', properties: {} },
  execute: async (_args: PokerGetBankrollParams, ctx: any) => {
    const { prisma, userId, projectId } = resolveWalletOwner(ctx);
    const bankroll = await getOrCreateBankroll(prisma, userId, projectId);
    return {
      balance: bankroll.balance,
      currency: bankroll.currency,
      formattedBalance: `$${bankroll.balance.toLocaleString()}`,
    };
  },
});

export const pokerGetBuyInOptionsTool = defineTool<PokerGetBuyInOptionsParams>({
  name: PokerTool.GET_BUY_IN_OPTIONS,
  description: "Computes table buy-in limits and presets from the table's big blind and the user's bankroll.",
  requiredRole: PokerRole.SPECTATOR,
  accessLevel: CuratorAccessLevel.READ_ONLY,
  parameters: {
    type: 'object',
    properties: {
      bbAmount: { type: 'number' },
    },
  },
  execute: async (args: PokerGetBuyInOptionsParams, ctx: any) => {
    const { prisma, userId, projectId } = resolveWalletOwner(ctx);
    const bankroll = await getOrCreateBankroll(prisma, userId, projectId);
    return getBuyInPresets(bankroll.balance, Number(args.bbAmount) || 20);
  },
});

export const pokerDepositBuyInTool = defineTool<PokerDepositBuyInParams>({
  name: PokerTool.DEPOSIT_BUY_IN,
  description: 'Deposits chips from persistent bankroll into table buy-in.',
  requiredRole: PokerRole.PLAYER,
  accessLevel: CuratorAccessLevel.SAFE_WRITE,
  parameters: {
    type: 'object',
    properties: {
      tableId: { type: 'string' },
      amount: { type: ['number', 'string'] },
      bbAmount: { type: 'number' },
    },
    required: ['amount'],
  },
  execute: async (args: PokerDepositBuyInParams, ctx: any) => {
    const { prisma, userId, projectId } = resolveWalletOwner(ctx);
    const limits = getBuyInLimits(Number(args.bbAmount) || 20);
    return depositBuyIn(prisma, userId, args.amount, args.tableId, projectId, limits);
  },
});

export const pokerCashOutTool = defineTool<PokerCashOutParams>({
  name: PokerTool.CASH_OUT,
  description: 'Credits table chips back into the persistent bankroll.',
  requiredRole: PokerRole.PLAYER,
  accessLevel: CuratorAccessLevel.SAFE_WRITE,
  parameters: {
    type: 'object',
    properties: {
      tableId: { type: 'string' },
      chips: { type: 'number' },
    },
    required: ['chips'],
  },
  execute: async (args: PokerCashOutParams, ctx: any) => {
    const { prisma, userId, projectId } = resolveWalletOwner(ctx);
    return cashOutToBankroll(prisma, userId, Number(args.chips) || 0, args.tableId, projectId);
  },
});

export const pokerReloadBankrollTool = defineTool<PokerReloadBankrollParams>({
  name: PokerTool.RELOAD_BANKROLL,
  description: 'Adds free-form game money to the session user\'s persistent bankroll (e.g. 5000, "$7,500", "10k").',
  requiredRole: PokerRole.PLAYER,
  accessLevel: CuratorAccessLevel.SAFE_WRITE,
  parameters: {
    type: 'object',
    properties: {
      amount: { type: ['number', 'string', 'object'] },
    },
  },
  execute: async (args: PokerReloadBankrollParams, ctx: any) => {
    const { prisma, userId, projectId } = resolveWalletOwner(ctx);
    const amount = parseChipAmount(args.amount);
    const reloaded = await reloadBankroll(prisma, userId, amount, projectId);
    return { success: reloaded.added > 0, added: reloaded.added, balance: reloaded.balance };
  },
});

export const pokerCloseTableTool = defineTool<PokerCloseTableParams>({
  name: PokerTool.CLOSE_TABLE,
  description: 'Closes the current lobby or table conversation, cashing out table chips to the bankroll.',
  requiredRole: PokerRole.PLAYER,
  accessLevel: CuratorAccessLevel.SAFE_WRITE,
  parameters: {
    type: 'object',
    properties: {
      reason: { type: 'string' },
    },
  },
  execute: async (args: PokerCloseTableParams, ctx: any) => {
    const host = ctx?.toolContext?.host || ctx?.host;
    const conversationId = Number(ctx?.conversationId);
    const reason = String(args.reason || 'user_exit');

    if (!host?.prisma || Number.isNaN(conversationId)) {
      return { closed: false, reason };
    }

    const conv = await host.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv) return { closed: false, reason };

    if (parseConversationMetadata(conv.metadata).isLobby) {
      await closePokerLobbyConversation(host, conversationId, reason);
    } else {
      // The workflow emits SESSION_EXITED itself
      await closePokerGameTable(host, conversationId, reason, false);
    }
    return { closed: true, conversationId, reason };
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
  pokerLobbyMenuTool,
  pokerCreateTableTool,
  pokerGetBankrollTool,
  pokerGetBuyInOptionsTool,
  pokerDepositBuyInTool,
  pokerCashOutTool,
  pokerReloadBankrollTool,
  pokerCloseTableTool,
  pokerStartHandTool,
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
  Object.fromEntries(
    pokerToolsList.flatMap((t) => [
      [t.name, t],
      ...(t.aliases || []).map((alias) => [alias, t]),
    ])
  )
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
        PokerTool.SPEECH,
        PokerTool.HUMAN_SPEECH,
        PokerTool.DEPOSIT_BUY_IN,
        PokerTool.CASH_OUT,
        PokerTool.RELOAD_BANKROLL,
        PokerTool.CLOSE_TABLE,
      ],
    },
    [PokerRole.SPECTATOR]: {
      name: PokerRole.SPECTATOR,
      description: 'Spectator observing table action, discovery, and leaderboard standings',
      tools: [
        PokerTool.LIST_TABLES,
        PokerTool.LOBBY_MENU,
        PokerTool.GET_CHOICES,
        PokerTool.GET_STANDINGS,
        PokerTool.GET_BANKROLL,
        PokerTool.GET_BUY_IN_OPTIONS,
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
  models: [PokerTableShape, PokerBankrollShape],
  stateProjectors: [pokerTableProjector],
  scripts: pokerScripts,
  agents: Object.fromEntries(
    Object.entries(POKER_AGENT_PROFILES)
      .filter(([_, profile]) => !profile.isHuman)
      .map(([key, profile]) => [
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
