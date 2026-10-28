/**
 * ---
 * id: human_turn
 * name: human_turn
 * description: Interactive Human Turn Module with Choices, Pause/Resume, and Action Dispatch
 * ---
 */
import { turnCtx } from '../models/pokerContext.ts';
import {
  defineModule,
  defineSubroutine,
  seq,
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
  gameState,
  is_table_paused,
  is_session_unpaused,
  is_turn_action_pause,
  is_turn_action_exit,
  is_resume_cmd,
  is_exit_cmd,
  get_legal_choices,
  apply_player_action,
  handle_user_exit,
  events,
  modules,
  steps,
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
      waitEvent(events.RESUME_ACTION, turnCtx.resumeCmd),
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

/**
 * Composable sequence for human decision and choices (prompt, pause, exit).
 */
export function buildHumanChoiceSteps() {
  const can_check = `(${gameState.currentBet} - ${gameState.players}[${gameState.activePlayerIdx}].streetBet) == 0`;
  return [
    get_legal_choices(),
    emitEvent(events.AWAITING_HUMAN_ACTION, {
      gameState: String(gameState),
    }),
    ifElse(
      can_check,
      choice('Your turn (Check or Bet):', String(turnCtx.poker_get_choices.choices), { as: turnCtx.turnAction }),
      choice('Your turn (Call, Raise, or Fold):', String(turnCtx.poker_get_choices.choices), { as: turnCtx.turnAction }),
    ),
    ifElse(
      is_turn_action_pause,
      handlePause(),
      ifElse(
        is_turn_action_exit,
        handle_user_exit(),
      ),
    ),
  ];
}

/**
 * Full interactive human turn sequence: choice prompt + action application.
 */
export function buildHumanTurnSteps() {
  return [
    ...buildHumanChoiceSteps(),
    ifElse(
      is_session_unpaused,
      seq(steps.APPLY_ACTION, [
        apply_player_action(turnCtx.turnAction),
        emitEvent(events.ACTION_TAKEN, {
          summary: String(gameState.lastActionSummary),
          player: `${gameState.lastActorName} || ${gameState.players}[${gameState.activePlayerIdx}].name`,
          action: String(turnCtx.turnAction),
          gameState: String(gameState),
        }),
      ]),
    ),
  ];
}

export function buildHumanTurnModule(): CuratorModuleNode {
  return defineModule(modules.HUMAN_TURN, {
    description: 'Interactive human turn gate with choices, pause/resume, and action application',
    subroutines: [handlePause],
  }, () => buildHumanTurnSteps());
}

export const humanTurnAst = buildHumanTurnModule();
