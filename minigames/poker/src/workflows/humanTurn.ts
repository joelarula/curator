/**
 * ---
 * id: human_turn
 * name: human_turn
 * description: Human Player Turn Module with Subroutines for Choices, Pause, and Action Dispatch
 * ---
 */

import type { CuratorModuleNode } from '../curator.ts';
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
  events,
  modules,
  subroutines,
  steps,
  defineModule,
  seq,
  sub,
  call,
  choice,
  ifElse,
  whileLoop,
  setState,
  reasons,
  defineSubroutine,
  emitEvent,
  waitEvent,
} = pokerComposables;

/**
 * First-class typed subroutine for pausing the table session.
 */
export const handlePause = defineSubroutine('handle_pause', {
  body: seq(steps.HANDLE_PAUSE, [
    setState({ isPaused: true }),
    emitEvent(events.TABLE_PAUSED, {
      tableId: String(gameState.tableId),
    }),
    whileLoop(
      is_table_paused,
      seq(steps.WAIT_RESUME, [
        waitEvent(events.RESUME_ACTION, ctx.resumeCmd),
        ifElse(
          is_resume_cmd,
          seq(steps.UNPAUSE, [
            setState({ isPaused: false }),
            emitEvent(events.TABLE_RESUMED, {
              tableId: String(gameState.tableId),
            }),
          ]),
          ifElse(
            is_exit_cmd,
            seq(steps.PAUSE_EXIT, [
              setState({ sessionEnded: true, isPaused: false }),
              emitEvent(events.SESSION_EXITED, { reason: reasons.USER_EXIT }),
            ]),
          ),
        ),
      ]),
    ),
  ]),
});

export function buildHumanTurnModule(): CuratorModuleNode {
  return defineModule(modules.HUMAN_TURN, () => {
    // 1. Auto-registering subroutine
    const handlePause = defineSubroutine(subroutines.HANDLE_PAUSE, () => [
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

    // 2. Main workflow sequence returned directly
    return [
      get_legal_choices(),
      choice('Your turn:', String(ctx.poker_get_choices.choices), { as: ctx.humanAction }),

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
    ];
  });
}

export const humanTurnAst = buildHumanTurnModule();

