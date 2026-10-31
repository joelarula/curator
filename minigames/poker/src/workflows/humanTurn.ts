/**
 * ---
 * id: human_turn
 * name: human_turn
 * description: Interactive seat - prompts the human with their legal choices (including pause and exit)
 * ---
 */
import { defineModule, defineSubroutine, choice, type CuratorModuleNode } from '../curator.ts';
import { pokerComposables } from '../composables/pokerComposables.ts';
import { actor, state, turnCtx, ifElse, offRecord } from '../models/pokerContext.ts';
import { AwaitingHumanAction } from '../models/pokerEvents.ts';

const { gameState, modules } = pokerComposables;

/** Human seat: prompts the table's legal choices; returns the chosen action (PAUSE / EXIT are handled by the table). */
export const humanDecision = defineSubroutine('human_decision', {
  params: { actor: { type: 'object', required: true } },
  body: [
    AwaitingHumanAction.emit({ gameState }),
    ifElse(
      gameState.currentBet.sub(actor.streetBet).eq(0),
      offRecord(choice('Your turn (Check or Bet):', state.turn.choices, { as: turnCtx.turnAction })),
      offRecord(choice('Your turn (Call, Raise, or Fold):', state.turn.choices, { as: turnCtx.turnAction })),
    ),
  ],
  // The choice is bound into state as well as context
  returns: state.turnAction,
});

/** The human seat's own script: prompts for the active seat. */
export const humanTurnAst: CuratorModuleNode = defineModule(modules.HUMAN_TURN, {
  description: 'Human seat: legal choices prompt for the active player',
}, () => [humanDecision({ actor: gameState.players.at(gameState.activePlayerIdx) })]);
