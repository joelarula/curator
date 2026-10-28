/**
 * Table rules as systems (Bevy `add_systems`): a seat's ActionIntent is validated, then applied.
 * They chain through events, so any submitter (seat handler, UI, bot) goes through the same rules.
 */
import { defineSubroutine, ifElse, system } from '../curator.ts';
import { pokerComposables } from '../composables/pokerComposables.ts';
import { turnCtx } from '../models/pokerContext.ts';
import { PokerTablePhase } from '../models/pokerContracts.ts';
import {
  ActionIntent, ActionValidated, ActionRejected, ActionResolved, ActionTaken, TablePhase,
} from '../models/pokerEvents.ts';

const { gameState, get_legal_choices, apply_player_action } = pokerComposables;

const intent = ActionIntent.payload();
const validated = ActionValidated.payload();

/** Accepts the intent when its action type is among the seat's legal choices. */
export const validateAction = defineSubroutine('validate_action', [
  get_legal_choices({}, { as: turnCtx.legalChoices }),
  ifElse(
    `${turnCtx.legalChoices}.choices.some((c) => c.args && c.args.action && c.args.action.type == ${intent.action}.type)`,
    ActionValidated.emit({ seatId: intent.seatId, action: intent.action }),
    [
      ActionRejected.emit({ seatId: intent.seatId, action: intent.action, reason: 'illegal action' }),
      ActionResolved.emit({ seatId: intent.seatId, accepted: false, reason: 'illegal action' }),
    ],
  ),
]);

/** Applies a validated action to the table and announces it. */
export const applyAction = defineSubroutine('apply_action', [
  apply_player_action(validated.action),
  ActionTaken.emit({
    player: `${gameState.lastActorName} || ${gameState.players}[${gameState.activePlayerIdx}].name`,
    action: validated.action,
    summary: gameState.lastActionSummary,
    gameState,
  }),
  ActionResolved.emit({ seatId: validated.seatId, accepted: true }),
]);

/** Registers the table rules in the enclosing module. */
export function tableSystems() {
  system({ on: ActionIntent, runIf: TablePhase.in(PokerTablePhase.SUBMIT), run: validateAction });
  system({ on: ActionValidated, run: applyAction });
}
