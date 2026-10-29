import {
  defineTool,
  type CuratorPlugin,
  type CuratorScriptDefinition,
  type CuratorReducer,
  CuratorSystemRole,
  CuratorAccessLevel,
} from '../curator.ts';
import {
  PokerModule,
  PokerTool,
  PokerReducer,
  PokerRole,
  PokerToolAlias,
  type PokerTableParams,
  type PokerGetStandingsParams,
  type PokerListTablesParams,
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
import type { PokerGameState } from '../types.ts';
import { getPokerStandings } from '../engine/pokerEngine.ts';
import { reduceTable } from '../engine/pokerTable.ts';
import { reduceTableTalk } from '../engine/tableTalk.ts';
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
  [PokerModule.RULES]: 'Table rules systems: validate and apply action intents',
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
// Curator Tool Registrations
// ----------------------------------------------------------------------------

function extractGameState(args: any, ctx: any): PokerGameState {
  return (args?.state || ctx?.state?.gameState) as PokerGameState;
}

/**
 * Pure reducers (run by `reduce(...)` nodes, no RBAC or tool record): the table reducer is the one way flows
 * reach the deterministic engine. Seats never run it; their decisions reach it as ActionIntent events.
 */
export const pokerReducers: Record<string, CuratorReducer> = {
  [PokerReducer.TABLE]: (args) => reduceTable((args as PokerTableParams).state as PokerGameState, (args as PokerTableParams).command as any),
  [PokerReducer.TABLE_TALK]: (args) => reduceTableTalk(args.talk, args.gameState, args.command) as unknown as Record<string, any>,
};

export const pokerGetStandingsTool = defineTool<PokerGetStandingsParams>({
  name: PokerTool.GET_STANDINGS,
  description: 'Returns the current session standings and chip profit/loss report.',
  aliases: [PokerToolAlias.STANDINGS],
  requiredRole: PokerRole.SPECTATOR,
  accessLevel: CuratorAccessLevel.SAFE_READ,
  parameters: { type: 'object', properties: { state: { type: 'object' } } },
  execute: async (args: PokerGetStandingsParams, ctx: any) => {
    const s = extractGameState(args, ctx);
    return !s || !s.players ? { standings: [], message: 'No active table game state found. Table may be in lobby or paused.' } : getPokerStandings(s);
  },
});

export const pokerListTablesTool = defineTool<PokerListTablesParams>({
  name: PokerTool.LIST_TABLES,
  description: 'Lists the unfinished poker tables of the current user, with the lounge menu and table choices for them.',
  aliases: [PokerToolAlias.LIST_TABLES],
  requiredRole: PokerRole.SPECTATOR,
  accessLevel: CuratorAccessLevel.SAFE_READ,
  parameters: { type: 'object', properties: {} },
  // Identity and project scope come only from the host session, never from tool args
  execute: async (_args: PokerListTablesParams, ctx: any) => {
    const host = ctx?.host;
    const reqCtx = (typeof ctx?.context === 'object' && ctx.context) || {};

    const { tables } = await queryActivePokerTables(ctx?.prisma, {
      projectId: String(ctx?.projectId || host?.project?.id || '').trim(),
      userId: String(ctx?.userId || host?.user?.id || '').trim(),
      playerName: String(reqCtx.playerName || host?.user?.name || '').trim(),
    });
    return { tables, ...buildLobbyMenu(tables) };
  },
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
  pokerGetStandingsTool,
  pokerListTablesTool,
  pokerCreateTableTool,
  pokerGetBankrollTool,
  pokerGetBuyInOptionsTool,
  pokerDepositBuyInTool,
  pokerCashOutTool,
  pokerReloadBankrollTool,
  pokerCloseTableTool,
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
    },
    [PokerRole.PLAYER]: {
      name: PokerRole.PLAYER,
      description: 'Active seated player eligible to wager chips and engage in table banter',
      subRoles: [PokerRole.SPECTATOR],
      tools: [
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
  reducers: pokerReducers,
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
