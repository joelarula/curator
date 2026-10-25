/**
 * ---
 * id: human_turn
 * name: human_turn
 * description: Interactive Human Turn Module with Choices, Pause/Resume, and Action Dispatch
 * ---
 */
import {
  defineModule,
  type CuratorModuleNode,
} from '../curator.ts';
import { pokerComposables } from '../composables/pokerComposables.ts';
import { handlePause, buildHumanTurnSteps } from './playerTurn.ts';

const { modules } = pokerComposables;

export { handlePause, buildHumanTurnSteps };

export function buildHumanTurnModule(): CuratorModuleNode {
  return defineModule(modules.HUMAN_TURN, {
    description: 'Interactive human turn gate with choices, pause/resume, and action application',
    subroutines: [handlePause],
  }, () => buildHumanTurnSteps());
}

export const humanTurnAst = buildHumanTurnModule();
