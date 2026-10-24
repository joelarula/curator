/**
 * ---
 * id: poker_workflow
 * name: poker_workflow
 * description: Curator Texas Hold'em Autonomous Event-Driven 5-Phase Game Loop Module
 * ---
 */

import {
  CuratorBuilder,
  type CuratorModuleNode,
  type CuratorSequentialNode,
} from '../curator.ts';
import { pokerComposables } from '../composables/pokerComposables.ts';

const {
  ctx,
  gameState,
  is_game_active,
  is_hand_active,
  is_street_active,
  active_player_is_human,
  is_table_paused,
  table_has_no_state,
  table_needs_players,
  is_session_unpaused,
  is_human_action_pause,
  is_human_action_exit,
  is_resume_cmd,
  start_poker_hand,
  deal_next_street,
  settle_showdown,
  check_game_over,
  rotate_dealer,
  ai_decision,
  apply_player_action,
  get_legal_choices,
  boot_table,
  join_lobby,
} = pokerComposables;

/**
 * Pure TypeScript representation of Texas Hold'em 5-Phase Autonomous Game Loop.
 * Compile-time verified with full type safety and minimal literal strings.
 */
export function buildPokerWorkflowModule(): CuratorModuleNode {
  return CuratorBuilder.defineModule('poker_workflow', {
    description: 'Curator Texas Hold\'em autonomous event-driven 5-phase game loop engine',
    main: CuratorBuilder.seq('poker:dynamic_engine', [
      // 1. Initialize open table lobby if not present
      CuratorBuilder.ifElse(
        table_has_no_state,
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
        ]),
      ),

      // 2. Main Game Session Loop
      CuratorBuilder.whileLoop(
        is_game_active,
        CuratorBuilder.seq('poker:single_hand', [
          // Phase 1: Start Hand
          start_poker_hand(),
          CuratorBuilder.emitEvent('poker:new_round', {
            handNumber: String(gameState.handNumber),
          }),
          CuratorBuilder.emitEvent('poker:phase_deal', {
            street: String(gameState.currentStreet),
          }),

          // Phase 2: Street Wagering Loop
          CuratorBuilder.whileLoop(
            is_hand_active,
            CuratorBuilder.seq('poker:street_loop', [
              CuratorBuilder.whileLoop(
                is_street_active,
                CuratorBuilder.seq('poker:turn_step', [
                  CuratorBuilder.ifElse(
                    active_player_is_human,
                    CuratorBuilder.seq('poker:human_agent_flow', [
                      get_legal_choices(),
                      CuratorBuilder.choice(
                        'Your turn:',
                        String(ctx.poker_get_choices.choices),
                        { as: 'humanAction' },
                      ),
                      CuratorBuilder.ifElse(
                        is_human_action_pause,
                        CuratorBuilder.seq('poker:handle_pause', [
                          CuratorBuilder.setState({ isPaused: true }),
                          CuratorBuilder.emitEvent('poker:table_paused', {
                            tableId: String(gameState.tableId),
                          }),
                          CuratorBuilder.whileLoop(
                            is_table_paused,
                            CuratorBuilder.seq('poker:wait_resume', [
                              CuratorBuilder.waitEvent('poker:resume_action', 'resumeCmd'),
                              CuratorBuilder.ifElse(
                                is_resume_cmd,
                                CuratorBuilder.seq('poker:unpause', [
                                  CuratorBuilder.setState({ isPaused: false }),
                                  CuratorBuilder.emitEvent('poker:table_resumed', {
                                    tableId: String(gameState.tableId),
                                  }),
                                ]),
                              ),
                            ]),
                          ),
                        ]),
                        CuratorBuilder.ifElse(
                          is_human_action_exit,
                          CuratorBuilder.seq('poker:handle_exit', [
                            CuratorBuilder.setState({ sessionEnded: true }),
                            CuratorBuilder.emitEvent('poker:session_exited', {
                              reason: 'user_exit',
                            }),
                          ]),
                          CuratorBuilder.seq('poker:apply_action', [
                            apply_player_action(ctx.humanAction),
                          ]),
                        ),
                      ),
                    ]),
                    CuratorBuilder.call('#ai_agent_flow', {}, { mode: 'inline' }),
                  ),
                  CuratorBuilder.ifElse(
                    is_session_unpaused,
                    CuratorBuilder.emitEvent('poker:action_taken', {
                      player: `${gameState.players}[${gameState.activePlayerIdx}].name`,
                    }),
                  ),
                ]),
              ),
              CuratorBuilder.ifElse(
                `${gameState} and not ${gameState.handOver}`,
                CuratorBuilder.call('#deal_next_street', {}, { mode: 'inline' }),
              ),
            ]),
          ),

          // Phase 3: Settle Showdown
          CuratorBuilder.call('#settle_showdown', {}, { mode: 'inline' }),

          // Phase 4: Standings & Button Rotation
          check_game_over(),
          rotate_dealer(),
        ]),
      ),

      // 3. Final Game Over Session Summary
      CuratorBuilder.emitEvent('poker:game_over', {
        standings: `${ctx.standings} || ${ctx.poker_check_game_over.standings}`,
      }),
    ]),
    subroutines: {
      ai_agent_flow: CuratorBuilder.sub(
        {},
        CuratorBuilder.seq('poker:ai_agent_flow', [
          ai_decision(),
          apply_player_action(),
        ]),
      ),
      deal_next_street: CuratorBuilder.sub(
        {},
        CuratorBuilder.seq('poker:deal_next_street', [
          deal_next_street(),
          CuratorBuilder.emitEvent('poker:phase_street', {
            street: String(gameState.currentStreet),
          }),
        ]),
      ),
      settle_showdown: CuratorBuilder.sub(
        {},
        CuratorBuilder.seq('poker:phase_settle_step', [
          settle_showdown(),
          CuratorBuilder.emitEvent('poker:phase_settle', {
            winnerSummary: String(ctx.winnerSummary),
          }),
        ]),
      ),
    },
  });
}

export const pokerWorkflowAst = buildPokerWorkflowModule();
