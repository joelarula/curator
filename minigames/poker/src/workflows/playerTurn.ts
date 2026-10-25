/**
 * ---
 * id: player_turn
 * name: player_turn
 * description: Universal Player Turn Module for Texas Hold'em (Interactive & Autonomous Players)
 * ---
 */
import {
  defineModule,
  defineSubroutine,
  choice,
  ifElse,
  whileLoop,
  waitEvent,
  setState,
  emitEvent,
  type CuratorModuleNode,
} from '../curator.ts';
import { pokerComposables } from '../composables/pokerComposables.ts';

const {
  ctx,
  gameState,
  active_player_is_interactive,
  is_table_paused,
  is_turn_action_pause,
  is_turn_action_exit,
  is_resume_cmd,
  is_exit_cmd,
  get_legal_choices,
  ai_decision,
  apply_player_action,
  events,
  modules,
  reasons,
} = pokerComposables;

/**
 * Universal subroutine for pausing the table session.
 */
export const handlePause = defineSubroutine('handle_pause', () => [
  setState({ isPaused: true }),
  emitEvent(events.TABLE_PAUSED, {
    tableId: String(gameState.tableId),
  }),
  whileLoop(
    is_table_paused,
    [
      waitEvent(events.RESUME_ACTION, ctx.resumeCmd),
      ifElse(
        is_resume_cmd,
        [
          setState({ isPaused: false }),
          emitEvent(events.TABLE_RESUMED, {
            tableId: String(gameState.tableId),
          }),
        ],
        ifElse(
          is_exit_cmd,
          [
            setState({ sessionEnded: true, isPaused: false }),
            emitEvent(events.SESSION_EXITED, { reason: reasons.USER_EXIT }),
          ],
        ),
      ),
    ],
  ),
]);

export function buildPlayerTurnModule(): CuratorModuleNode {
  const can_check = `(${gameState.currentBet} - ${gameState.players}[${gameState.activePlayerIdx}].streetBet) == 0`;

  return defineModule(modules.PLAYER_TURN, {
    description: 'Universal Texas Hold\'em player turn module handling interactive choices and autonomous agent decisions',
    subroutines: [handlePause],
  }, () => [
    ifElse(
      active_player_is_interactive,
      [
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
      ],
      [
        ai_decision(),
        apply_player_action(`${ctx.poker_ai_decision.action} || ${ctx.lastAiAction} || ${ctx.turnAction}`),
      ],
    ),
  ]);
}

export const playerTurnAst = buildPlayerTurnModule();
