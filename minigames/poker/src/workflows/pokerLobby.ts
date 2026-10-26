/**
 * ---
 * id: poker_lobby
 * name: poker_lobby
 * description: Texas Hold'em Lounge Concierge & Table Selection Module
 * ---
 */
import {
  defineModule,
  seq,
  input,
  ifElse,
  match,
  whileLoop,
  setState,
  emitEvent,
  type CuratorModuleNode,
} from '../curator.ts';
import {
  pokerComposables,
  bootTableSub,
  buildTableBootStep,
} from '../composables/pokerComposables.ts';
import type { PokerWorkflowContext } from '../models/pokerContext.ts';

import { PokerEvent, type PokerEventType } from '../models/pokerContracts.ts';

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
  event: PokerEventType;
  payload: { id: PokerLobbyActionType };
  value: { id: PokerLobbyActionType };
}

export type PokerLobbyOption = PokerLobbyChoice;

export interface PokerTableChoice {
  id: string;
  tableId: string;
  title: string;
  label: string;
  aliases: string[];
  event: PokerEventType;
  payload: { id: string };
  value: { id: string };
}

export type PokerChoice = PokerLobbyChoice | PokerTableChoice;

export function getLobbyChoices(hasUnfinishedGames: boolean = false, count?: number): PokerLobbyChoice[] {
  const choices: PokerLobbyChoice[] = [
    {
      id: PokerLobbyAction.NEW,
      label: 'New Game - Start fresh table',
      description: 'Start fresh table',
      aliases: ['1', 'n', 'new'],
      event: PokerEvent.LOBBY_CHOICE,
      payload: { id: PokerLobbyAction.NEW },
      value: { id: PokerLobbyAction.NEW },
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
      event: PokerEvent.LOBBY_CHOICE,
      payload: { id: PokerLobbyAction.RESUME },
      value: { id: PokerLobbyAction.RESUME },
    });
  }

  choices.push({
    id: PokerLobbyAction.EXIT,
    label: 'Exit - Quit session',
    description: 'Quit session',
    aliases: [String(choices.length + 1), 'q', 'exit', 'quit'],
    event: PokerEvent.LOBBY_CHOICE,
    payload: { id: PokerLobbyAction.EXIT },
    value: { id: PokerLobbyAction.EXIT },
  });

  return choices;
}

export const getLobbyOptions = getLobbyChoices;
export const DEFAULT_LOBBY_CHOICES = getLobbyChoices(false);
export const DEFAULT_LOBBY_OPTIONS = DEFAULT_LOBBY_CHOICES;




const {
  ctx,
  list_tables,
  create_table,
  events,
  modules,
  get_bankroll,
  deposit_buy_in,
  reload_bankroll,
  handle_user_exit,
} = pokerComposables;

function buildBuyInSequence() {
  return [
    get_bankroll({
      userId: String(ctx.userId),
      playerName: String(ctx.playerName),
      sbAmount: `${ctx.sbAmount} || 10`,
      bbAmount: `${ctx.bbAmount} || 20`,
    }),
    ifElse<PokerWorkflowContext>(
      (c) => Boolean(c.poker_get_bankroll && !c.poker_get_bankroll.canAfford),
      seq('RELOAD_BANKROLL_FLOW', [
        reload_bankroll({ userId: String(ctx.userId), amount: 5000 }),
        get_bankroll({
          userId: String(ctx.userId),
          playerName: String(ctx.playerName),
          sbAmount: `${ctx.sbAmount} || 10`,
          bbAmount: `${ctx.bbAmount} || 20`,
        }),
      ]),
    ),
    input(
      'Enter Buy-In amount (or select preset):',
      String(ctx.poker_get_bankroll.choices),
      { as: ctx.buyInChoice }
    ),
    deposit_buy_in({
      userId: String(ctx.userId),
      tableId: String(ctx.tableId),
      amount: `${ctx.buyInChoice.amount} || ${ctx.buyInChoice} || 1000`,
    }),
    setState({
      selectedBuyIn: `${ctx.poker_deposit_buy_in.deposited} || ${ctx.buyInChoice.amount} || ${ctx.buyInChoice} || 1000`,
    }),
  ];
}

function buildTableSelectedFlow() {
  return [
    ...buildBuyInSequence(),
    emitEvent(events.TABLE_SELECTED, {
      tableId: String(ctx.tableId),
      buyIn: ctx.selectedBuyIn,
    }),
  ];
}

export function buildPokerLobbyModule(): CuratorModuleNode {
  return defineModule(modules.LOBBY, {
    description: "Texas Hold'em Lounge Concierge for table selection and dynamic player seating",
    subroutines: [bootTableSub],
  }, () => [
    // 1. Interactive Lobby Selection Gate (New Game, Resume Game, Exit)
    whileLoop<PokerWorkflowContext>(
      (c) => !c.tableId && !c.sessionEnded && !c.bypassLobby,
      [
        list_tables({
          playerName: String(ctx.playerName),
          playerId: String(ctx.playerId),
          userId: String(ctx.userId),
        }),
        ifElse<PokerWorkflowContext>(
          (c) => Boolean(c.poker_list_tables?.hasUnfinishedGames),
          setState({ lobbyChoices: getLobbyChoices(true) }),
          setState({ lobbyChoices: getLobbyChoices(false) }),
        ),
        input('Lobby Options:', String(ctx.lobbyChoices), { as: ctx.lobbyChoice }),
        match(ctx.lobbyChoice, {
          [lobbyActions.EXIT]: [
            handle_user_exit(),
          ],
          [lobbyActions.RESUME]: [
            input('Select Table:', String(ctx.poker_list_tables.choices), { as: ctx.selectedTable }),
            match(ctx.selectedTable, {
              [lobbyActions.BACK]: [
                setState({
                  lobbyChoice: null,
                  selectedTable: null,
                }),
              ],
              _: [
                setState({
                  tableId: `${ctx.selectedTable.id} || ${ctx.selectedTable.tableId} || ${ctx.selectedTable}`,
                }),
                ...buildTableSelectedFlow(),
              ],
            }),
          ],
          [lobbyActions.NEW]: [
            create_table({
              playerName: String(ctx.playerName),
            }),
            setState({
              tableId: `${ctx.poker_create_table.tableId} || ${ctx.tableId} || 'poker:high_roller_lounge'`,
            }),
            ...buildTableSelectedFlow(),
          ],
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
