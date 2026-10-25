/**
 * ---
 * id: agent_turn
 * name: agent_turn
 * description: Autonomous Player Agent Turn Module using seated agent instruction & prompt
 * ---
 */
import {
  defineModule,
  type CuratorModuleNode,
} from '../curator.ts';
import { pokerComposables } from '../composables/pokerComposables.ts';
import { buildAgentTurnSteps } from './playerTurn.ts';

const { modules } = pokerComposables;

export { buildAgentTurnSteps };

export function buildAgentTurnModule(): CuratorModuleNode {
  return defineModule(modules.AGENT_TURN, {
    description: 'Autonomous AI player decision flow with LLM persona and prompt injection',
  }, () => buildAgentTurnSteps());
}

export const agentTurnAst = buildAgentTurnModule();

