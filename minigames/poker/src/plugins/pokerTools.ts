import {
  defineTool,
  defineReducer,
  type CuratorReducer,
  CuratorAccessLevel,
} from '../curator.ts';
import {
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
import {
  closePokerLobbyConversation,
  closePokerGameTable,
  parseConversationMetadata,
} from '../session/pokerSession.ts';
import type { PokerGameState } from '../types.ts';
import { getPokerStandings } from '../engine/pokerEngine.ts';
import { reduceTable } from '../engine/pokerTable.ts';
import { reduceTableTalk, resolveTalkConfig, type PokerTalkConfig, type TableTalkCommandInput, type TableTalkState } from '../engine/tableTalk.ts';
import { queryActivePokerTables } from '../services/pokerTableStore.ts';
import {
  getOrCreateBankroll,
  depositBuyIn,
  cashOutToBankroll,
  reloadBankroll,
  getBuyInPresets,
  getBuyInLimits,
  parseChipAmount,
} from '../services/pokerBankrollStore.ts';

function extractGameState(args: any, ctx: any): PokerGameState {
  return (args?.state || ctx?.state?.gameState) as PokerGameState;
}

/**
 * First-class typed reducers (Pillar 2): directly callable as pure functions AND expose `.reduce(args, opts)`
 * to emit `Curator_Reduce` AST nodes in workflows without stringly-typed reducer names.
 */
export const pokerTableReducer = defineReducer<PokerTableParams>(
  PokerReducer.TABLE,
  (args) => reduceTable(args.state as PokerGameState, args.command as any) as unknown as Record<string, any>
);

export interface PokerTableTalkParams {
  talk?: TableTalkState;
  gameState?: PokerGameState;
  command: TableTalkCommandInput;
  /** `$config.poker.talk`; missing keys fall back to the defaults. */
  config?: Partial<PokerTalkConfig>;
}

export const pokerTableTalkReducer = defineReducer<PokerTableTalkParams>(
  PokerReducer.TABLE_TALK,
  (args) => reduceTableTalk(args.talk, args.gameState as PokerGameState, args.command, resolveTalkConfig(args.config || undefined)) as unknown as Record<string, any>
);

export const pokerReducers: Record<string, CuratorReducer> = {
  [PokerReducer.TABLE]: pokerTableReducer,
  [PokerReducer.TABLE_TALK]: pokerTableTalkReducer,
};

/**
 * First-class callable tools (Pillar 2): each `defineTool<TArgs>` instance is both a runtime plugin tool
 * and a typed workflow AST builder `tool(args?, { as?, spread? })`.
 */
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

