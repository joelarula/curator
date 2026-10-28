/**
 * ---
 * id: human_turn
 * name: human_turn
 * description: Interactive seat - prompts the human with their legal choices (including pause and exit)
 * ---
 */
import { defineModule, defineSubroutine, ifElse, choice, type CuratorModuleNode } from '../curator.ts';
import { pokerComposables } from '../composables/pokerComposables.ts';
import { actor, turnCtx } from '../models/pokerContext.ts';
import { AwaitingHumanAction } from '../models/pokerEvents.ts';

const { gameState, get_legal_choices, modules } = pokerComposables;

/** Human seat: legal choices prompt; returns the chosen action (PAUSE / EXIT are handled by the table). */
export const humanDecision = defineSubroutine('human_decision', {
  params: { actor: { type: 'object', required: true } },
  body: [
    get_legal_choices({}, { as: turnCtx.legalChoices }),
    AwaitingHumanAction.emit({ gameState }),
    ifElse(
      `(${gameState.currentBet} - ${actor.streetBet}) == 0`,
      choice('Your turn (Check or Bet):', String(turnCtx.legalChoices.choices), { as: turnCtx.turnAction }),
      choice('Your turn (Call, Raise, or Fold):', String(turnCtx.legalChoices.choices), { as: turnCtx.turnAction }),
    ),
  ],
  // The choice is bound into state as well as context
  returns: '$state.turnAction',
});

/** The human seat's own script: prompts for the active seat. */
export const humanTurnAst: CuratorModuleNode = defineModule(modules.HUMAN_TURN, {
  description: 'Human seat: legal choices prompt for the active player',
}, () => [humanDecision({ actor: `${gameState.players}[${gameState.activePlayerIdx}]` })]);
