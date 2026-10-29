import {
  defineTool,
  defineReducer,
  type CuratorReducer,
  type CuratorToolContext,
  CuratorAccessLevel,
} from '../curator.ts';
import type { CuratorHost } from '../curatorHost.ts';
import {
  PokerTool,
  PokerReducer,
  PokerRole,
  PokerToolAlias,
  extractGameState,
  buildLobbyMenu,
  type PokerTableParams,
  type PokerTableTalkParams,
  type PokerGetStandingsParams,
  type PokerStandingsResult,
  type PokerListTablesParams,
  type PokerListTablesResult,
  type PokerCreateTableParams,
  type PokerCreateTableResult,
  type PokerGetBankrollParams,
  type PokerGetBuyInOptionsParams,
  type PokerDepositBuyInParams,
  type PokerCashOutParams,
  type PokerReloadBankrollParams,
  type PokerCloseTableParams,
  type PokerCloseTableResult,
  type BankrollSummary,
  type BuyInOptionsResult,
  type DepositBuyInResult,
  type CashOutResult,
  type ReloadBankrollToolResult,
  type PokerBankrollDb,
  type PokerStoreDb,
} from '../models/index.ts';
import type { PokerGameState } from '../types.ts';
import { getPokerStandings } from '../engine/pokerEngine.ts';
import { reduceTable, type PokerTableStep } from '../engine/pokerTable.ts';
import { reduceTableTalk, resolveTalkConfig, type TableTalkState } from '../engine/tableTalk.ts';
import { queryActivePokerTables } from '../services/pokerTableStore.ts';
import {
  getOrCreateBankroll,
  depositBuyIn,
  cashOutToBankroll,
  reloadBankroll,
  getBuyInPresets,
  getBuyInLimits,
  parseChipAmount,
  toBankrollSummary,
} from '../services/pokerBankrollStore.ts';

export type { PokerTableTalkParams };

export interface PokerToolContext extends CuratorToolContext {
  host?: CuratorHost;
  toolContext?: { host?: CuratorHost };
  context?: { playerName?: string; sessionId?: string; [key: string]: unknown };
  state?: { gameState?: PokerGameState } | PokerGameState;
}

function resolveToolHost(ctx?: PokerToolContext): CuratorHost | undefined {
  return ctx?.toolContext?.host ?? ctx?.host;
}

function resolveGameState(args?: PokerGetStandingsParams, ctx?: PokerToolContext): PokerGameState | null {
  return (
    extractGameState<PokerGameState>(args) ??
    extractGameState<PokerGameState>(ctx?.state as { gameState?: PokerGameState; state?: PokerGameState } | null)
  );
}

/** Wallet tools act on the session user's bankroll only; identity never comes from args. */
function resolveWalletOwner(ctx?: PokerToolContext): { prisma: PokerBankrollDb; userId: string; projectId?: string } {
  const host = resolveToolHost(ctx);
  const prisma = (host?.prisma ?? ctx?.prisma) as PokerBankrollDb | undefined;
  const userId = host?.user?.id ?? ctx?.userId;
  if (!prisma || !userId) {
    throw new Error('Bankroll tools require a host session with prisma and an authenticated user');
  }
  const projectId = host?.project?.id ?? (ctx?.projectId ? String(ctx.projectId) : undefined);
  return { prisma, userId: String(userId), projectId };
}

/**
 * First-class typed reducers (Pillar 2): directly callable as pure functions AND expose `.reduce(args, opts)`
 * to emit `Curator_Reduce` AST nodes in workflows without stringly-typed reducer names.
 */
export const pokerTableReducer = defineReducer<PokerTableParams, PokerTableStep>(
  PokerReducer.TABLE,
  (args) => reduceTable(args.state, args.command)
);

export const pokerTableTalkReducer = defineReducer<PokerTableTalkParams, TableTalkState>(
  PokerReducer.TABLE_TALK,
  (args) => reduceTableTalk(args.talk, args.gameState, args.command, resolveTalkConfig(args.config))
);

export const pokerReducers: Record<string, CuratorReducer> = {
  [PokerReducer.TABLE]: pokerTableReducer,
  [PokerReducer.TABLE_TALK]: pokerTableTalkReducer,
};

/**
 * First-class callable tools (Pillar 2): each `defineTool<TArgs, TOutput>` instance is both a runtime plugin tool
 * and a typed workflow AST builder `tool(args?, { as?, spread? })`.
 */
export const pokerGetStandingsTool = defineTool<PokerGetStandingsParams, PokerStandingsResult>({
  name: PokerTool.GET_STANDINGS,
  description: 'Returns the current session standings and chip profit/loss report.',
  aliases: [PokerToolAlias.STANDINGS],
  requiredRole: PokerRole.SPECTATOR,
  accessLevel: CuratorAccessLevel.SAFE_READ,
  parameters: { type: 'object', properties: { state: { type: 'object' } } },
  execute: async (args, ctx: PokerToolContext) => {
    const s = resolveGameState(args, ctx);
    return !s || !s.players
      ? { standings: [], message: 'No active table game state found. Table may be in lobby or paused.' }
      : getPokerStandings(s);
  },
});

export const pokerListTablesTool = defineTool<PokerListTablesParams, PokerListTablesResult>({
  name: PokerTool.LIST_TABLES,
  description: 'Lists the unfinished poker tables of the current user, with the lounge menu and table choices for them.',
  aliases: [PokerToolAlias.LIST_TABLES],
  requiredRole: PokerRole.SPECTATOR,
  accessLevel: CuratorAccessLevel.SAFE_READ,
  parameters: { type: 'object', properties: {} },
  // Identity and project scope come only from the host session, never from tool args
  execute: async (_args, ctx: PokerToolContext) => {
    const host = resolveToolHost(ctx);
    const reqCtx = (typeof ctx?.context === 'object' && ctx.context) || {};
    const prisma = (host?.prisma ?? ctx?.prisma) as PokerStoreDb | undefined;

    const { tables } = await queryActivePokerTables(prisma, {
      projectId: String(ctx?.projectId || host?.project?.id || '').trim(),
      userId: String(ctx?.userId || host?.user?.id || '').trim(),
      playerName: String(reqCtx.playerName || host?.user?.name || '').trim(),
    });
    return { tables, ...buildLobbyMenu(tables) };
  },
});

export const pokerCreateTableTool = defineTool<PokerCreateTableParams, PokerCreateTableResult>({
  name: PokerTool.CREATE_TABLE,
  description: 'Creates a new poker game table conversation with seated players.',
  requiredRole: PokerRole.SPECTATOR,
  accessLevel: CuratorAccessLevel.SAFE_WRITE,
  parameters: {
    type: 'object',
    properties: {
      tableName: { type: 'string' },
      title: { type: 'string' },
      playerName: { type: 'string' },
      startingChips: { type: 'number' },
      smallBlind: { type: 'number' },
      bigBlind: { type: 'number' },
      maxSeats: { type: 'number' },
    },
  },
  execute: async (args, ctx: PokerToolContext) => {
    const host = resolveToolHost(ctx);
    const title = args?.title || args?.tableName;
    if (host) {
      const { createPokerGameTable } = await import('../session/pokerSession.ts');
      const tableInfo = await createPokerGameTable(host, { ...args, title });
      return { success: true, table: { ...tableInfo }, tableId: tableInfo.tableId };
    }
    const tableId = `poker:table_${crypto.randomUUID()}`;
    return { success: true, tableId, table: { title: title || `Table #${tableId.slice(-6)}` } };
  },
});

export const pokerGetBankrollTool = defineTool<PokerGetBankrollParams, BankrollSummary>({
  name: PokerTool.GET_BANKROLL,
  description: "Retrieves the session user's persistent chip bankroll (wallet).",
  requiredRole: PokerRole.SPECTATOR,
  accessLevel: CuratorAccessLevel.READ_ONLY,
  parameters: { type: 'object', properties: {} },
  execute: async (_args, ctx: PokerToolContext) => {
    const { prisma, userId, projectId } = resolveWalletOwner(ctx);
    const bankroll = await getOrCreateBankroll(prisma, userId, projectId);
    return toBankrollSummary(bankroll);
  },
});

export const pokerGetBuyInOptionsTool = defineTool<PokerGetBuyInOptionsParams, BuyInOptionsResult>({
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
  execute: async (args, ctx: PokerToolContext) => {
    const { prisma, userId, projectId } = resolveWalletOwner(ctx);
    const bankroll = await getOrCreateBankroll(prisma, userId, projectId);
    return getBuyInPresets(bankroll.balance, Number(args.bbAmount) || 20);
  },
});

export const pokerDepositBuyInTool = defineTool<PokerDepositBuyInParams, DepositBuyInResult>({
  name: PokerTool.DEPOSIT_BUY_IN,
  description: 'Deposits chips from persistent bankroll into table buy-in.',
  requiredRole: PokerRole.PLAYER,
  accessLevel: CuratorAccessLevel.SAFE_WRITE,
  parameters: {
    type: 'object',
    properties: {
      tableId: { type: ['string', 'number'] },
      amount: { type: ['number', 'string', 'object'] },
      bbAmount: { type: 'number' },
    },
    required: ['amount'],
  },
  execute: async (args, ctx: PokerToolContext) => {
    const { prisma, userId, projectId } = resolveWalletOwner(ctx);
    const limits = getBuyInLimits(Number(args.bbAmount) || 20);
    return depositBuyIn(prisma, userId, args.amount, args.tableId, projectId, limits);
  },
});

export const pokerCashOutTool = defineTool<PokerCashOutParams, CashOutResult>({
  name: PokerTool.CASH_OUT,
  description: 'Credits table chips back into the persistent bankroll.',
  requiredRole: PokerRole.PLAYER,
  accessLevel: CuratorAccessLevel.SAFE_WRITE,
  parameters: {
    type: 'object',
    properties: {
      tableId: { type: ['string', 'number'] },
      chips: { type: 'number' },
    },
    required: ['chips'],
  },
  execute: async (args, ctx: PokerToolContext) => {
    const { prisma, userId, projectId } = resolveWalletOwner(ctx);
    return cashOutToBankroll(prisma, userId, Number(args.chips) || 0, args.tableId, projectId);
  },
});

export const pokerReloadBankrollTool = defineTool<PokerReloadBankrollParams, ReloadBankrollToolResult>({
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
  execute: async (args, ctx: PokerToolContext) => {
    const { prisma, userId, projectId } = resolveWalletOwner(ctx);
    const amount = parseChipAmount(args.amount);
    const reloaded = await reloadBankroll(prisma, userId, amount, projectId);
    return { success: reloaded.added > 0, added: reloaded.added, balance: reloaded.balance };
  },
});

export const pokerCloseTableTool = defineTool<PokerCloseTableParams, PokerCloseTableResult>({
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
  execute: async (args, ctx: PokerToolContext) => {
    const host = resolveToolHost(ctx);
    const conversationId = Number(ctx?.conversationId);
    const reason = String(args.reason || 'user_exit');

    if (!host?.prisma || Number.isNaN(conversationId)) {
      return { closed: false, reason };
    }

    const conv = await host.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv) return { closed: false, reason };

    const {
      closePokerLobbyConversation,
      closePokerGameTable,
      parseConversationMetadata,
    } = await import('../session/pokerSession.ts');

    if (parseConversationMetadata(conv.metadata).isLobby) {
      await closePokerLobbyConversation(host, conversationId, reason);
    } else {
      // The workflow emits SESSION_EXITED itself
      await closePokerGameTable(host, conversationId, reason, false);
    }
    return { closed: true, conversationId, reason };
  },
});

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

