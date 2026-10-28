/**
 * ---
 * id: poker_lobby
 * name: poker_lobby
 * description: Texas Hold'em Lounge Concierge & Table Selection Module
 * ---
 */
import { lobbyCtx as lobbyCtxProxy, bankrollCtx, bootCtx } from '../models/pokerContext.ts';
import {
  defineModule,
  defineSubroutine,
  seq,
  input,
  ifElse,
  match,
  whileLoop as loopwhile,
  waitEvent,
  setState,
  emitEvent,
  type CuratorModuleNode,
} from '../curator.ts';
import {
  pokerComposables,
  pokerPredicates,
} from '../composables/pokerComposables.ts';
import type { PokerLobbyContext, PokerBankrollContext } from '../models/pokerContext.ts';

const {
  gameState,
  steps,
  boot_table,
  join_lobby,
  list_tables,
  create_table,
  events,
  modules,
  get_bankroll,
  deposit_buy_in,
  reload_bankroll,
  handle_user_exit,
} = pokerComposables;

/**
 * Poker Lobby Actions, Options, and Choices
 */
export const PokerLobbyAction = {
  NEW: 'new',
  RESUME: 'resume',
  EXIT: 'exit',
  BACK: 'back',
} as const;

export type PokerLobbyActionType = (typeof PokerLobbyAction)[keyof typeof PokerLobbyAction];
export const lobbyActions = PokerLobbyAction;

export interface PokerLobbyChoice {
  id: PokerLobbyActionType;
  label: string;
  description?: string;
  aliases: string[];
}

export interface PokerTableChoice {
  id: string;
  tableId: string;
  title: string;
  label: string;
  aliases: string[];
}

export function getLobbyChoices(hasUnfinishedGames: boolean = false, count?: number): PokerLobbyChoice[] {
  const choices: PokerLobbyChoice[] = [
    {
      id: PokerLobbyAction.NEW,
      label: 'New Game - Start fresh table',
      description: 'Start fresh table',
      aliases: ['1', 'n', 'new'],
    },
  ];

  if (hasUnfinishedGames) {
    const label = count !== undefined && count > 0
      ? `Resume Game - Select from active/paused tables (${count} available)`
      : 'Resume Game - Select from active/paused tables';
    choices.push({
      id: PokerLobbyAction.RESUME,
      label,
      description: 'Select from active/paused tables',
      aliases: [String(choices.length + 1), 'r', 'resume', 'continue'],
    });
  }

  choices.push({
    id: PokerLobbyAction.EXIT,
    label: 'Exit - Quit session',
    description: 'Quit session',
    aliases: [String(choices.length + 1), 'q', 'exit', 'quit'],
  });

  return choices;
}

export const DEFAULT_LOBBY_CHOICES = getLobbyChoices(false);

/**
 * Subroutine for bootstrapping an open table with dynamic seating.
 */
export const bootTableSub = defineSubroutine('boot_table', () => [
  boot_table(),
  emitEvent(events.LOBBY_READY, {
    tableId: String(gameState.tableId),
  }),
  loopwhile(
    pokerPredicates.table_needs_players,
    seq(steps.WAIT_FOR_PLAYERS, [
      emitEvent(events.AWAITING_PLAYERS, {
        tableId: String(gameState.tableId),
        seatedCount: String(gameState.players.length),
      }),
      waitEvent(events.PLAYER_JOINED, bootCtx.joinRequest),
      join_lobby(bootCtx.joinRequest),
    ]),
  ),
  emitEvent(events.TABLE_READY, {
    tableId: String(gameState.tableId),
    playerCount: String(gameState.players.length),
  }),
]);

/**
 * Composable conditional step that boots the table if state has not been initialized.
 */
export function buildTableBootStep() {
  return ifElse(
    `${pokerPredicates.table_has_no_state} and not ${bootCtx.sessionEnded}`,
    bootTableSub(),
  );
}

function buildBuyInSequence() {
  return [
    get_bankroll({
      userId: String(bankrollCtx.userId),
      playerName: String(bankrollCtx.playerName),
      sbAmount: `${bankrollCtx.sbAmount} || 10`,
      bbAmount: `${bankrollCtx.bbAmount} || 20`,
    }),
    ifElse<PokerBankrollContext>(
      (c) => Boolean(c.poker_get_bankroll && !c.poker_get_bankroll.canAfford),
      seq('RELOAD_BANKROLL_FLOW', [
        reload_bankroll({ userId: String(bankrollCtx.userId), amount: 5000 }),
        get_bankroll({
          userId: String(bankrollCtx.userId),
          playerName: String(bankrollCtx.playerName),
          sbAmount: `${bankrollCtx.sbAmount} || 10`,
          bbAmount: `${bankrollCtx.bbAmount} || 20`,
        }),
      ]),
    ),
    input(
      'Enter Buy-In amount (or select preset):',
      String(bankrollCtx.poker_get_bankroll.choices),
      { as: bankrollCtx.buyInChoice }
    ),
    deposit_buy_in({
      userId: String(bankrollCtx.userId),
      tableId: String(bankrollCtx.tableId),
      amount: `${bankrollCtx.buyInChoice.amount} || ${bankrollCtx.buyInChoice} || 1000`,
    }),
    setState({
      selectedBuyIn: `${bankrollCtx.poker_deposit_buy_in.deposited} || ${bankrollCtx.buyInChoice.amount} || ${bankrollCtx.buyInChoice} || 1000`,
    }),
  ];
}

function buildTableSelectedFlow() {
  return [
    ...buildBuyInSequence(),
    emitEvent(events.TABLE_SELECTED, {
      tableId: String(lobbyCtxProxy.tableId),
      buyIn: lobbyCtxProxy.selectedBuyIn,
    }),
  ];
}

function buildResumeTableFlow() {
  return [
    input('Select Table:', String(lobbyCtxProxy.poker_list_tables.choices), { as: lobbyCtxProxy.selectedTable }),
    match(lobbyCtxProxy.selectedTable, {
      [lobbyActions.BACK]: [
        setState({
          lobbyChoice: null,
          selectedTable: null,
        }),
      ],
      _: [
        setState({
          tableId: `${lobbyCtxProxy.selectedTable.id} || ${lobbyCtxProxy.selectedTable.tableId} || ${lobbyCtxProxy.selectedTable}`,
        }),
        ...buildTableSelectedFlow(),
      ],
    }),
  ];
}

function buildNewTableFlow() {
  return [
    create_table({
      playerName: String(lobbyCtxProxy.playerName),
    }),
    setState<PokerLobbyContext>((c) => ({
      tableId: c.poker_create_table?.tableId || `poker:table_${crypto.randomUUID()}`,
    })),
    ...buildTableSelectedFlow(),
  ];
}

export function buildPokerLobbyModule(): CuratorModuleNode {
  return defineModule(modules.LOBBY, {
    description: "Texas Hold'em Lounge Concierge for table selection and dynamic player seating",
    subroutines: [bootTableSub],
  }, () => [
    // 1. Interactive Lobby Selection Gate (New Game, Resume Game, Exit)
    loopwhile<PokerLobbyContext>((c) => !c.tableId && !c.sessionEnded,
      [
        list_tables(),
        input('Lobby Options:', String(lobbyCtxProxy.poker_list_tables.lobbyChoices), { as: lobbyCtxProxy.lobbyChoice }),
        match(lobbyCtxProxy.lobbyChoice, {
          [lobbyActions.EXIT]: [handle_user_exit()],
          [lobbyActions.RESUME]: buildResumeTableFlow(),
          [lobbyActions.NEW]: buildNewTableFlow(),
          _: [
            setState({
              lobbyChoice: null,
            }),
          ],
        }),
      ],
    ),

    // 2. Fallback Table Booting: Initializes table if tableId was provided directly without state
    buildTableBootStep(),
  ]);
}

export const pokerLobbyAst = buildPokerLobbyModule();
