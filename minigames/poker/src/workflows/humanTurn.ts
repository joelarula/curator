/**
 * ---
 * id: human_turn
 * name: human_turn
 * description: Human Player Turn Module with Subroutines for Choices, Pause, and Action Dispatch
 * ---
 */

import { CuratorBuilder, type CuratorModuleNode } from '../curator.ts';
import { pokerComposables } from '../composables/pokerComposables.ts';

const {
  ctx,
  gameState,
  get_legal_choices,
  apply_player_action,
  is_table_paused,
  is_human_action_pause,
  is_human_action_exit,
  is_resume_cmd,
  is_exit_cmd,
} = pokerComposables;

export function buildHumanTurnModule(): CuratorModuleNode {
  return CuratorBuilder.defineModule('human_turn', {
    description: 'Interactive human turn gate with choices, pause/resume, and action application',
    main: CuratorBuilder.seq('poker:human_turn', [
      get_legal_choices(),
      CuratorBuilder.choice('Your turn:', String(ctx.poker_get_choices.choices), { as: 'humanAction' }),

      CuratorBuilder.ifElse(
        is_human_action_pause,
        CuratorBuilder.call('#handle_pause'),
        CuratorBuilder.ifElse(
          is_human_action_exit,
          CuratorBuilder.seq('poker:handle_exit', [
            CuratorBuilder.setState({ sessionEnded: true }),
            CuratorBuilder.emitEvent('poker:session_exited', { reason: 'user_exit' }),
          ]),
          CuratorBuilder.seq('poker:apply_action', [
            apply_player_action(ctx.humanAction),
          ]),
        ),
      ),
    ]),
    subroutines: {
      handle_pause: CuratorBuilder.sub(
        {},
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
                CuratorBuilder.ifElse(
                  is_exit_cmd,
                  CuratorBuilder.seq('poker:pause_exit', [
                    CuratorBuilder.setState({ sessionEnded: true, isPaused: false }),
                    CuratorBuilder.emitEvent('poker:session_exited', { reason: 'user_exit' }),
                  ]),
                ),
              ),
            ]),
          ),
        ]),
      ),
    },
  });
}

export const humanTurnAst = buildHumanTurnModule();
