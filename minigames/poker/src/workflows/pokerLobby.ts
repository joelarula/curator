/**
 * ---
 * id: poker_lobby
 * name: poker_lobby
 * description: Texas Hold'em Lounge Concierge & Table Selection Module
 * ---
 */

import { CuratorBuilder, type CuratorModuleNode } from '../curator.ts';
import { pokerComposables } from '../composables/pokerComposables.ts';

const {
  ctx,
  gameState,
  boot_table,
  list_tables,
  join_lobby,
  is_lobby_exit,
  is_lobby_resume,
  is_session_active,
  table_needs_players,
} = pokerComposables;

export function buildPokerLobbyModule(): CuratorModuleNode {
  return CuratorBuilder.defineModule('poker_lobby', {
    description: "Texas Hold'em Lounge Concierge for table selection and dynamic player seating",
    main: CuratorBuilder.seq('poker:lobby_manager', [
      // 1. Interactive Lobby Selection Gate (New Game, Resume Game, Exit)
      CuratorBuilder.ifElse(
        `not ${ctx.tableId} and not ${ctx.bypassLobby}`,
        CuratorBuilder.seq('poker:lobby_gate', [
          CuratorBuilder.choice(
            'Lobby Options:',
            [
              { id: 'new', label: 'New Game - Start fresh table', aliases: ['n'], value: { id: 'new' } },
              { id: 'resume', label: 'Resume Game - Select from active/paused tables', aliases: ['r', 'continue'], value: { id: 'resume' } },
              { id: 'exit', label: 'Exit - Quit session', aliases: ['q', 'exit', 'quit'], value: { id: 'exit' } },
            ],
            { as: 'lobbyChoice' },
          ),
          CuratorBuilder.ifElse(
            is_lobby_exit,
            CuratorBuilder.seq('poker:exit_lobby', [
              CuratorBuilder.setState({ sessionEnded: true }),
              CuratorBuilder.emitEvent('poker:session_exited', { reason: 'user_exit' }),
            ]),
            CuratorBuilder.ifElse(
              is_lobby_resume,
              CuratorBuilder.seq('poker:resume_table_flow', [
                list_tables(),
                CuratorBuilder.choice('Select Table:', String(ctx.poker_list_tables.choices), { as: 'selectedTable' }),
                CuratorBuilder.setState({
                  tableId: `${ctx.selectedTable.id} || ${ctx.selectedTable.tableId} || ${ctx.selectedTable}`,
                }),
              ]),
              CuratorBuilder.seq('poker:new_table_flow', [
                CuratorBuilder.setState({
                  tableId: `${ctx.tableId} || 'poker:high_roller_lounge'`,
                }),
              ]),
            ),
          ),
        ]),
      ),

      // 2. If session not exited, initialize table and seat players
      CuratorBuilder.ifElse(
        is_session_active,
        CuratorBuilder.seq('poker:boot_table', [
          boot_table(),
          CuratorBuilder.emitEvent('poker:lobby_ready', {
            tableId: String(gameState.tableId),
          }),
          CuratorBuilder.whileLoop(
            table_needs_players,
            CuratorBuilder.seq('poker:wait_for_players', [
              CuratorBuilder.emitEvent('poker:awaiting_players', {
                tableId: String(gameState.tableId),
                seatedCount: String(gameState.players.length),
              }),
              CuratorBuilder.waitEvent('poker:player_joined', 'joinRequest'),
              join_lobby(ctx.joinRequest),
            ]),
          ),
          CuratorBuilder.emitEvent('poker:table_ready', {
            tableId: String(gameState.tableId),
            playerCount: String(gameState.players.length),
          }),
        ]),
      ),
    ]),
  });
}

export const pokerLobbyAst = buildPokerLobbyModule();
