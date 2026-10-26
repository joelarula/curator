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
import { handlePause } from './playerTurn.ts';
import { aiAgentFlow, buildAgentDecisionSteps } from './agentTurn.ts';

const {
  ctx,
  gameState,
  is_game_active,
  is_hand_active,
  is_street_active,
  active_player_is_interactive,
  is_table_paused,
  table_has_no_state,
  table_needs_players,
  is_session_unpaused,
  is_turn_action_pause,
  is_turn_action_exit,
  is_resume_cmd,
  start_poker_hand,
  deal_next_street,
  settle_showdown,
  check_game_over,
  rotate_dealer,
  apply_player_action,
  get_legal_choices,
  boot_table,
  join_lobby,
  events,
  modules,
  steps,
  reasons,
} = pokerComposables;

export { aiAgentFlow };

/**
 * Composable sequence for universal player turn handling (interactive choices and autonomous agent deliberation).
 */
export function buildPlayerTurnStep() {
  return seq(steps.TURN_STEP, [
    ifElse(
      active_player_is_interactive,
      seq(steps.HUMAN_AGENT_FLOW, [
        get_legal_choices(),
        emitEvent(events.AWAITING_HUMAN_ACTION, {
          gameState: String(gameState),
        }),
        choice(
          'Your turn:',
          String(ctx.poker_get_choices.choices),
          { as: ctx.turnAction },
        ),
        ifElse(
          is_turn_action_pause,
          handlePause(),
          ifElse(
            is_turn_action_exit,
            seq(steps.HANDLE_EXIT, [
              setState({ sessionEnded: true }),
              emitEvent(events.SESSION_EXITED, {
                reason: reasons.USER_EXIT,
              }),
            ]),
          ),
        ),
      ]),
      seq(steps.AI_AGENT_FLOW, buildAgentDecisionSteps()),
    ),
    ifElse(
      is_session_unpaused,
      seq(steps.APPLY_ACTION, [
        apply_player_action(ctx.turnAction),
        emitEvent(events.ACTION_TAKEN, {
          summary: String(gameState.lastActionSummary),
          player: `${gameState.lastActorName} || ${gameState.players}[${gameState.activePlayerIdx}].name`,
          action: String(ctx.turnAction),
          gameState: String(gameState),
        }),
      ]),
    ),
  ]);
}

/**
 * Subroutine for dealing the next street community cards.
 */
export const dealNextStreetSub = defineSubroutine('deal_next_street', {
  defaultMode: 'inline',
  body: seq(steps.DEAL_NEXT_STREET, [
    deal_next_street(),
    emitEvent(events.PHASE_STREET, {
      street: String(gameState.currentStreet),
      gameState: String(gameState),
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
      gameState: String(gameState),
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
      subroutines: [handlePause, aiAgentFlow, dealNextStreetSub, settleShowdownSub],
    },
    () => seq(steps.DYNAMIC_ENGINE, [
      // 1. Initialize open table if state not yet booted
      ifElse(
        `${table_has_no_state} and not ${ctx.sessionEnded}`,
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
          emitEvent(events.TABLE_READY, {
            tableId: String(gameState.tableId),
            playerCount: String(gameState.players.length),
          }),
        ]),
      ),

      // 3. Main Game Session Loop
      whileLoop(
        is_game_active,
        seq(steps.SINGLE_HAND, [
          // Phase 1: Start Hand
          start_poker_hand(),
          emitEvent(events.NEW_ROUND, {
            handNumber: String(gameState.handNumber),
            gameState: String(gameState),
          }),
          emitEvent(events.PHASE_DEAL, {
            street: String(gameState.currentStreet),
            gameState: String(gameState),
          }),

          // Phase 2: Street Wagering Loop
          whileLoop(
            is_hand_active,
            seq(steps.STREET_LOOP, [
              whileLoop(
                is_street_active,
                buildPlayerTurnStep(),
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

