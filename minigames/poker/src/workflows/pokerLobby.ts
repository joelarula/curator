/**
 * ---
 * id: poker_lobby
 * name: poker_lobby
 * description: Texas Hold'em Lounge Concierge & Table Selection Module
 * ---
 */
import {
  defineModule,
  input,
  ifElse,
  match,
  whileLoop,
  setState,
  emitEvent,
  waitEvent,
  type CuratorModuleNode,
} from '../curator.ts';
import { pokerComposables } from '../composables/pokerComposables.ts';
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
  gameState,
  boot_table,
  list_tables,
  create_table,
  join_lobby,
  events,
  modules,
  reasons,
} = pokerComposables;

export function buildPokerLobbyModule(): CuratorModuleNode {
  return defineModule(modules.LOBBY, {
    description: "Texas Hold'em Lounge Concierge for table selection and dynamic player seating",
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
        input(
          'Lobby Options:',
          String(ctx.poker_list_tables.lobbyChoices),
          { as: ctx.lobbyChoice },
        ),
        match(ctx.lobbyChoice, {
          [lobbyActions.EXIT]: [
            setState({ sessionEnded: true }),
            emitEvent(events.SESSION_EXITED, { reason: reasons.USER_EXIT }),
          ],
          [lobbyActions.RESUME]: [
            input('Select Table:', String(ctx.poker_list_tables.choices), { as: ctx.selectedTable }),
            match(ctx.selectedTable, {
              [lobbyActions.BACK]: [
                setState({
                  lobbyChoice: null,
                  selectedTable: null,
                  __humanInputReceived__: false,
                }),
              ],
              _: [
                setState({
                  tableId: `${ctx.selectedTable.id} || ${ctx.selectedTable.tableId} || ${ctx.selectedTable}`,
                }),
                emitEvent(events.TABLE_SELECTED, {
                  tableId: String(ctx.tableId),
                }),
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
            emitEvent(events.TABLE_SELECTED, {
              tableId: String(ctx.tableId),
            }),
          ],
          _: [
            setState({
              lobbyChoice: null,
            }),
          ],
        }),
      ],
    ),

    // 2. If session not exited, initialize table and seat players
    ifElse<PokerWorkflowContext>(
      (c) => !c.sessionEnded,
      [
        boot_table(),
        emitEvent(events.LOBBY_READY, {
          tableId: String(gameState.tableId),
        }),
        whileLoop<PokerWorkflowContext>(
          (c) => !c.gameState || c.gameState.players.length < 2,
          [
            emitEvent(events.AWAITING_PLAYERS, {
              tableId: String(gameState.tableId),
              seatedCount: String(gameState.players.length),
            }),
            waitEvent(events.PLAYER_JOINED, ctx.joinRequest),
            join_lobby(ctx.joinRequest),
          ],
        ),
        emitEvent(events.TABLE_READY, {
          tableId: String(gameState.tableId),
          playerCount: String(gameState.players.length),
        }),
      ],
    ),
  ]);
}

export const pokerLobbyAst = buildPokerLobbyModule();
