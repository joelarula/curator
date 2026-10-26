/**
 * ---
 * id: player_turn
 * name: player_turn
 * description: Universal Player Turn Module for Texas Hold'em (Interactive & Autonomous Players)
 * ---
 */
import {
  defineModule,
  seq,
  ifElse,
  emitEvent,
  type CuratorModuleNode,
} from '../curator.ts';
import { pokerComposables } from '../composables/pokerComposables.ts';
import { buildAgentDecisionSteps, buildAgentTurnSteps } from './agentTurn.ts';
import { buildHumanChoiceSteps, buildHumanTurnSteps, handlePause } from './humanTurn.ts';

const {
  ctx,
  gameState,
  active_player_is_interactive,
  is_session_unpaused,
  apply_player_action,
  events,
  modules,
  steps,
} = pokerComposables;

/**
 * Composable sequence for universal player turn handling (interactive choices and autonomous agent deliberation).
 */
export function buildPlayerTurnStep() {
  return seq(steps.TURN_STEP, [
    ifElse(
      active_player_is_interactive,
      seq(steps.HUMAN_AGENT_FLOW, buildHumanChoiceSteps()),
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
          speech: `${ctx.speech} || ${ctx.turnAction}.speech || ''`,
          gameState: String(gameState),
        }),
      ]),
    ),
  ]);
}

export function buildPlayerTurnModule(): CuratorModuleNode {
  return defineModule(modules.PLAYER_TURN, {
    description: 'Universal Texas Hold\'em player turn module handling interactive choices and autonomous agent decisions',
    subroutines: [handlePause],
  }, () => [
    buildPlayerTurnStep(),
  ]);
}

export const playerTurnAst = buildPlayerTurnModule();
export { handlePause, buildHumanTurnSteps, buildAgentTurnSteps };
