/**
 * ---
 * id: human_turn
 * name: human_turn
 * description: Human Player Turn Module with Subroutines for Choices, Pause, and Action Dispatch
 * ---
 */
import {
  defineModule,
  choice,
  ifElse,
  setState,
  emitEvent,
  type CuratorModuleNode,
} from '../curator.ts';
import { pokerComposables } from '../composables/pokerComposables.ts';
import { handlePause } from './playerTurn.ts';

const {
  ctx,
  gameState,
  is_turn_action_pause,
  is_turn_action_exit,
  get_legal_choices,
  apply_player_action,
  events,
  modules,
  reasons,
} = pokerComposables;

export { handlePause };

/**
 * Flow-specific composable for human player turn predicates and decision gates.
 */
export function useHumanTurn() {
  const is_table_paused = pokerComposables.is_table_paused;
  const is_human_action_pause = pokerComposables.is_turn_action_pause;
  const is_human_action_exit = pokerComposables.is_turn_action_exit;
  const is_resume_cmd = pokerComposables.is_resume_cmd;
  const is_exit_cmd = pokerComposables.is_exit_cmd;
  const can_check = `(${gameState.currentBet} - ${gameState.players}[${gameState.activePlayerIdx}].streetBet) == 0`;

  return {
    is_table_paused,
    is_human_action_pause,
    is_human_action_exit,
    is_resume_cmd,
    is_exit_cmd,
    can_check,
  };
}

export function buildHumanTurnModule(): CuratorModuleNode {
  const can_check = `(${gameState.currentBet} - ${gameState.players}[${gameState.activePlayerIdx}].streetBet) == 0`;

  return defineModule(modules.HUMAN_TURN, {
    description: 'Interactive human turn gate with choices, pause/resume, and action application',
    subroutines: [handlePause],
  }, () => [
    get_legal_choices(),
    ifElse(
      can_check,
      choice('Your turn (Check or Bet):', String(ctx.poker_get_choices.choices), { as: ctx.turnAction }),
      choice('Your turn (Call, Raise, or Fold):', String(ctx.poker_get_choices.choices), { as: ctx.turnAction }),
    ),
    ifElse(
      is_turn_action_pause,
      handlePause(),
      ifElse(
        is_turn_action_exit,
        [
          setState({ sessionEnded: true }),
          emitEvent(events.SESSION_EXITED, { reason: reasons.USER_EXIT }),
        ],
        [
          apply_player_action(ctx.turnAction),
        ],
      ),
    ),
  ]);
}

export const humanTurnAst = buildHumanTurnModule();
