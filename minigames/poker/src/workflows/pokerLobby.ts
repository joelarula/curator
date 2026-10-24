/**
 * ---
 * id: poker_lobby
 * name: poker_lobby
 * description: Texas Hold'em Lounge Concierge & Table Selection Module
 * ---
 */

import type { CuratorModuleNode } from '../curator.ts';
import { pokerComposables } from '../composables/pokerComposables.ts';

/**
 * Flow-specific actions for poker lobby selection.
 */
export const PokerLobbyAction = {
  NEW: 'new',
  RESUME: 'resume',
  EXIT: 'exit',
} as const;
export type PokerLobbyActionType = typeof PokerLobbyAction[keyof typeof PokerLobbyAction];
export const lobbyActions = PokerLobbyAction;

const {
  ctx,
  gameState,
  boot_table,
  list_tables,
  join_lobby,
  events,
  modules,
  defineModule,
  choice,
  ifElse,
  whileLoop,
  setState,
  reasons,
  emitEvent,
  waitEvent,
} = pokerComposables;

/**
 * Flow-specific composable for lobby predicates and state gates.
 */
export function usePokerLobby() {
  const is_lobby_exit = `${ctx.lobbyChoice.id} == '${lobbyActions.EXIT}' or ${ctx.lobbyChoice} == '${lobbyActions.EXIT}'`;
  const is_lobby_resume = `${ctx.lobbyChoice.id} == '${lobbyActions.RESUME}' or ${ctx.lobbyChoice} == '${lobbyActions.RESUME}'`;
  const is_session_active = `not ${ctx.sessionEnded}`;
  const table_needs_players = `not ${ctx.gameState} or ${ctx.gameState.players.length} < 2`;

  return {
    is_lobby_exit,
    is_lobby_resume,
    is_session_active,
    table_needs_players,
  };
}

export function buildPokerLobbyModule(): CuratorModuleNode {
  const { is_lobby_exit, is_lobby_resume, is_session_active, table_needs_players } = usePokerLobby();

  return defineModule(modules.LOBBY, {
    description: "Texas Hold'em Lounge Concierge for table selection and dynamic player seating",
  }, () => [
    // 1. Interactive Lobby Selection Gate (New Game, Resume Game, Exit)
    ifElse(
      `not ${ctx.tableId} and not ${ctx.bypassLobby}`,
      [
        choice(
          'Lobby Options:',
          [
            { id: lobbyActions.NEW, label: 'New Game - Start fresh table', aliases: ['n'], value: { id: lobbyActions.NEW } },
            { id: lobbyActions.RESUME, label: 'Resume Game - Select from active/paused tables', aliases: ['r', 'continue'], value: { id: lobbyActions.RESUME } },
            { id: lobbyActions.EXIT, label: 'Exit - Quit session', aliases: ['q', 'exit', 'quit'], value: { id: lobbyActions.EXIT } },
          ],
          { as: ctx.lobbyChoice },
        ),
        ifElse(
          is_lobby_exit,
          [
            setState({ sessionEnded: true }),
            emitEvent(events.SESSION_EXITED, { reason: reasons.USER_EXIT }),
          ],
          ifElse(
            is_lobby_resume,
            [
              list_tables(),
              choice('Select Table:', String(ctx.poker_list_tables.choices), { as: ctx.selectedTable }),
              setState({
                tableId: `${ctx.selectedTable.id} || ${ctx.selectedTable.tableId} || ${ctx.selectedTable}`,
              }),
            ],
            [
              setState({
                tableId: `${ctx.tableId} || 'poker:high_roller_lounge'`,
              }),
            ],
          ),
        ),
      ],
    ),

    // 2. If session not exited, initialize table and seat players
    ifElse(
      is_session_active,
      [
        boot_table(),
        emitEvent(events.LOBBY_READY, {
          tableId: String(gameState.tableId),
        }),
        whileLoop(
          table_needs_players,
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
