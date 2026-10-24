/**
 * ---
 * id: agent_turn
 * name: agent_turn
 * description: Autonomous Player Agent Turn Module using seated agent instruction & prompt
 * ---
 */

import { CuratorBuilder, type CuratorModuleNode } from '../curator.ts';
import { pokerComposables } from '../composables/pokerComposables.ts';

const { ctx, ai_decision, apply_player_action } = pokerComposables;

export function buildAgentTurnModule(): CuratorModuleNode {
  return CuratorBuilder.defineModule('agent_turn', {
    description: 'Autonomous AI player decision flow with LLM persona and prompt injection',
    main: CuratorBuilder.seq('poker:agent_turn', [
      ai_decision(),
      apply_player_action(`${ctx.poker_ai_decision.action} || ${ctx.lastAiAction} || ${ctx.action}`),
    ]),
  });
}

export const agentTurnAst = buildAgentTurnModule();
