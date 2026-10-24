/**
 * ---
 * id: human_turn
 * name: human_turn
 * description: Human Player Turn Module with Subroutines for Choices, Pause, and Action Dispatch
 * ---
 */
import {
  defineModule,
  defineSubroutine,
  choice,
  ifElse,
  whileLoop,
  setState,
  emitEvent,
  waitEvent,
  type CuratorModuleNode,
} from '../curator.ts';
import { pokerComposables } from '../composables/pokerComposables.ts';

const {
  ctx,
  gameState,
  get_legal_choices,
  apply_player_action,
  events,
  modules,
  subroutines,
  reasons,
} = pokerComposables;

/**
 * Flow-specific composable for human player turn predicates and decision gates.
 */
export function useHumanTurn() {
  const is_table_paused = `${ctx.isPaused} and not ${ctx.sessionEnded}`;
  const is_human_action_pause = `${ctx.humanAction.type} == 'pause'`;
  const is_human_action_exit = `${ctx.humanAction.type} == 'exit'`;
  const is_resume_cmd = `${ctx.resumeCmd.type} == 'resume' or ${ctx.resumeCmd} == 'resume'`;
  const is_exit_cmd = `${ctx.resumeCmd.type} == 'exit' or ${ctx.resumeCmd} == 'exit'`;
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

/**
 * First-class typed subroutine for pausing the table session.
 */
export const handlePause = defineSubroutine(subroutines.HANDLE_PAUSE, () => {
  const { is_table_paused, is_resume_cmd, is_exit_cmd } = useHumanTurn();

  return [
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
  ];
});

export function buildHumanTurnModule(): CuratorModuleNode {
  const {
    is_human_action_pause,
    is_human_action_exit,
    can_check,
  } = useHumanTurn();

  return defineModule(modules.HUMAN_TURN, {
    description: 'Interactive human turn gate with choices, pause/resume, and action application',
    subroutines: [handlePause],
  }, () => [
    get_legal_choices(),
    ifElse(
      can_check,
      choice('Your turn (Check or Bet):', String(ctx.poker_get_choices.choices), { as: ctx.humanAction }),
      choice('Your turn (Call, Raise, or Fold):', String(ctx.poker_get_choices.choices), { as: ctx.humanAction }),
    ),

    ifElse(
      is_human_action_pause,
      handlePause(),
      ifElse(
        is_human_action_exit,
        [
          setState({ sessionEnded: true }),
          emitEvent(events.SESSION_EXITED, { reason: reasons.USER_EXIT }),
        ],
        [
          apply_player_action(ctx.humanAction),
        ],
      ),
    ),
  ]);
}

export const humanTurnAst = buildHumanTurnModule();

