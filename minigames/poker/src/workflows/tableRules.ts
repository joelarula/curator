/**
 * ---
 * id: poker_rules
 * name: poker_rules
 * description: Table rules as systems - validate and apply seat action intents, close on exit
 * ---
 */
/**
 * Table rules as systems (Bevy `add_systems`): a seat's ActionIntent is validated, then applied, and a
 * session that exits is closed.
 * They chain through events, so any submitter (seat handler, UI, bot) goes through the same rules.
 */
import { defineModule, defineSubroutine, system, type CuratorModuleNode } from '../curator.ts';
import { pokerComposables } from '../composables/pokerComposables.ts';
import { state, ifElse, setState } from '../models/pokerContext.ts';
import { PokerTablePhase, PokerSessionReason } from '../models/pokerContracts.ts';
import {
  ActionIntent, ActionValidated, ActionRejected, ActionResolved, SessionExited, TablePhase,
} from '../models/pokerEvents.ts';

const { act, close_table, modules } = pokerComposables;

const intent = ActionIntent.payload();
const validated = ActionValidated.payload();

/** Illegal intents a seat may send back per turn before the engine coerces the action to a legal one. */
export const MAX_TURN_REJECTIONS = 2;
const rejections = state.turnRejections.orDefault(0);

// The table reducer keeps the deciding seat's legal choices in `$state.turn`
const isLegal = `(${state.turn}.choices || []).some((c) => c.action && c.action.type == (${intent.action}.type || ${intent.action}))`;

/**
 * Accepts the intent when its action type is among the seat's legal choices. An illegal one goes back
 * to the seat a bounded number of times; after that it is passed on and the engine sanitizes it.
 */
export const validateAction = defineSubroutine('validate_action', [
  ifElse(
    isLegal,
    ActionValidated.emit({ seatId: intent.seatId, action: intent.action }),
    ifElse(
      rejections.lt(MAX_TURN_REJECTIONS),
      [
        setState({ turnRejections: `{{${rejections.add(1)}}}` }),
        ActionRejected.emit({ seatId: intent.seatId, action: intent.action, reason: 'illegal action' }),
        ActionResolved.emit({ seatId: intent.seatId, accepted: false, reason: 'illegal action' }),
      ],
      [
        ActionRejected.emit({ seatId: intent.seatId, action: intent.action, reason: 'illegal action, coerced to a legal one' }),
        ActionValidated.emit({ seatId: intent.seatId, action: intent.action }),
      ],
    ),
  ),
]);

/**
 * Applies a validated action (the engine sanitizes it); the table then advances on its own and emits
 * everything that happened on the way (action, streets, showdown, next hand).
 */
export const applyAction = defineSubroutine('apply_action', [
  setState({ turnRejections: 0 }),
  ...act(validated.action),
  ActionResolved.emit({ seatId: validated.seatId, accepted: true }),
]);

const exited = SessionExited.payload();

/** Whoever leaves (lobby or table), their conversation is closed and table chips are cashed out. */
export const closeOnExit = defineSubroutine('close_on_exit', [
  close_table({ reason: exited.reason.orDefault(PokerSessionReason.USER_EXIT) }),
]);

/** The rules module holds only systems; they run beside every lobby and table, gated by phase. */
export const pokerRulesAst: CuratorModuleNode = defineModule(modules.RULES, {
  description: "Texas Hold'em table rules: validate and apply seat action intents, close on exit",
}, () => {
  system({ on: ActionIntent, runIf: TablePhase.in(PokerTablePhase.SUBMIT), run: validateAction });
  system({ on: ActionValidated, run: applyAction });
  system({ on: SessionExited, run: closeOnExit });
  return undefined;
});
