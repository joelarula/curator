/**
 * ---
 * id: poker_action
 * name: poker_action
 * description: Texas Hold'em Action Processing Module with Pot Commitment & Event Emission
 * ---
 */

import { CuratorBuilder, type CuratorModuleNode } from '../curator.ts';
import { pokerComposables } from '../composables/pokerComposables.ts';

const { ctx, gameState, params, apply_player_action } = pokerComposables;

export function buildPokerActionModule(): CuratorModuleNode {
  return CuratorBuilder.defineModule('poker_action', {
    description: 'Applies player actions, commits wagers to pots, and emits state updates',
    params: {
      action: { type: 'object', description: 'PlayerAction to apply' },
    },
    main: CuratorBuilder.seq('poker:apply_action_step', [
      apply_player_action(`${params.action} || ${ctx.action}`),
      CuratorBuilder.emitEvent('poker:action_applied', {
        player: `${gameState.players}[${gameState.activePlayerIdx}].name`,
        action: `${params.action} || ${ctx.action}`,
        pot: gameState.pot,
      }),
    ]),
  });
}

export const pokerActionAst = buildPokerActionModule();
