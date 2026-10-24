/**
 * ---
 * id: poker_workflow
 * name: poker_workflow
 * description: Curator Texas Hold'em Autonomous Event-Driven 5-Phase Game Loop Module
 * ---
 */
import {
  defineModule,
  defineSubroutine,
  seq,
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
  events,
  modules,
  steps,
  reasons,
} = pokerComposables;

/**
 * Subroutine for autonomous AI decision calculation and action dispatch.
 */
export const aiAgentFlow = defineSubroutine('ai_agent_flow', {
  defaultMode: 'inline',
  body: seq(steps.AI_AGENT_FLOW, [
    ai_decision(),
    apply_player_action(),
  ]),
});

/**
 * Subroutine for dealing the next street community cards.
 */
export const dealNextStreetSub = defineSubroutine('deal_next_street', {
  defaultMode: 'inline',
  body: seq(steps.DEAL_NEXT_STREET, [
    deal_next_street(),
    emitEvent(events.PHASE_STREET, {
      street: String(gameState.currentStreet),
    }),
  ]),
});

/**
 * Subroutine for showdown adjudication and pot allocation.
 */
export const settleShowdownSub = defineSubroutine('settle_showdown', {
  defaultMode: 'inline',
  body: seq(steps.PHASE_SETTLE_STEP, [
    settle_showdown(),
    emitEvent(events.PHASE_SETTLE, {
      winnerSummary: String(ctx.winnerSummary),
    }),
  ]),
});

/**
 * Pure TypeScript representation of Texas Hold'em 5-Phase Autonomous Game Loop.
 * Compile-time verified with full type safety and minimal literal strings.
 */
export function buildPokerWorkflowModule(): CuratorModuleNode {
  return defineModule(
    modules.WORKFLOW,
    {
      description: "Curator Texas Hold'em autonomous event-driven 5-phase game loop engine",
      subroutines: [aiAgentFlow, dealNextStreetSub, settleShowdownSub],
    },
    () => seq(steps.DYNAMIC_ENGINE, [
      // 1. Initialize open table lobby if not present
      ifElse(
        table_has_no_state,
        seq(steps.BOOT_TABLE, [
          boot_table(),
          emitEvent(events.LOBBY_READY, {
            tableId: String(gameState.tableId),
          }),
          whileLoop(
            table_needs_players,
            seq(steps.WAIT_FOR_PLAYERS, [
              emitEvent(events.AWAITING_PLAYERS, {
                tableId: String(gameState.tableId),
                seatedCount: String(gameState.players.length),
              }),
              waitEvent(events.PLAYER_JOINED, ctx.joinRequest),
              join_lobby(ctx.joinRequest),
            ]),
          ),
        ]),
      ),

      // 2. Main Game Session Loop
      whileLoop(
        is_game_active,
        seq(steps.SINGLE_HAND, [
          // Phase 1: Start Hand
          start_poker_hand(),
          emitEvent(events.NEW_ROUND, {
            handNumber: String(gameState.handNumber),
          }),
          emitEvent(events.PHASE_DEAL, {
            street: String(gameState.currentStreet),
          }),

          // Phase 2: Street Wagering Loop
          whileLoop(
            is_hand_active,
            seq(steps.STREET_LOOP, [
              whileLoop(
                is_street_active,
                seq(steps.TURN_STEP, [
                  ifElse(
                    active_player_is_human,
                    seq(steps.HUMAN_AGENT_FLOW, [
                      get_legal_choices(),
                      choice(
                        'Your turn:',
                        String(ctx.poker_get_choices.choices),
                        { as: ctx.humanAction },
                      ),
                      ifElse(
                        is_human_action_pause,
                        seq(steps.HANDLE_PAUSE, [
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
                              ),
                            ]),
                          ),
                        ]),
                        ifElse(
                          is_human_action_exit,
                          seq(steps.HANDLE_EXIT, [
                            setState({ sessionEnded: true }),
                            emitEvent(events.SESSION_EXITED, {
                              reason: reasons.USER_EXIT,
                            }),
                          ]),
                          seq(steps.APPLY_ACTION, [
                            apply_player_action(ctx.humanAction),
                          ]),
                        ),
                      ),
                    ]),
                    aiAgentFlow(),
                  ),
                  ifElse(
                    is_session_unpaused,
                    emitEvent(events.ACTION_TAKEN, {
                      player: `${gameState.players}[${gameState.activePlayerIdx}].name`,
                    }),
                  ),
                ]),
              ),
              ifElse(
                `${gameState} and not ${gameState.handOver}`,
                dealNextStreetSub(),
              ),
            ]),
          ),

          // Phase 3: Settle Showdown
          settleShowdownSub(),

          // Phase 4: Standings & Button Rotation
          check_game_over(),
          rotate_dealer(),
        ]),
      ),

      // 3. Final Game Over Session Summary
      emitEvent(events.GAME_OVER, {
        standings: `${ctx.standings} || ${ctx.poker_check_game_over.standings}`,
      }),
    ]),
  );
}

export const pokerWorkflowAst = buildPokerWorkflowModule();

