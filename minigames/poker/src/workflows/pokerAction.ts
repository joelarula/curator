/**
 * ---
 * id: poker_action
 * name: poker_action
 * description: Texas Hold'em Action Processing Module with Pot Commitment & Event Emission
 * ---
 */
import {
  defineModule,
  seq,
  emitEvent,
  type CuratorModuleNode,
} from '../curator.ts';
import { pokerComposables } from '../composables/pokerComposables.ts';

const {
  ctx,
  gameState,
  params,
  apply_player_action,
  events,
  modules,
  steps,
} = pokerComposables;

export function buildPokerActionModule(): CuratorModuleNode {
  return defineModule(modules.ACTION, {
    description: 'Applies player actions, commits wagers to pots, and emits state updates',
    params: {
      action: { type: 'object', description: 'PlayerAction to apply' },
    },
  }, () => [
    apply_player_action(`${params.action} || ${ctx.action}`),
    emitEvent(events.ACTION_APPLIED, {
      player: `${gameState.players}[${gameState.activePlayerIdx}].name`,
      action: `${params.action} || ${ctx.action}`,
      pot: gameState.pot,
    }),
    emitEvent(events.ACTION_TAKEN, {
      summary: String(gameState.lastActionSummary),
      player: `${gameState.players}[${gameState.activePlayerIdx}].name`,
      action: `${params.action} || ${ctx.action}`,
      pot: gameState.pot,
      gameState: String(gameState),
    }),
  ]);
}

export const pokerActionAst = buildPokerActionModule();

