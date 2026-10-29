/**
 * ---
 * id: player_turn
 * name: player_turn
 * description: One seat's turn - the seat's actor handler decides, the table rules validate and apply it
 * ---
 */
import { defineModule, actorRef, type CuratorModuleNode } from '../curator.ts';
import { pokerComposables } from '../composables/pokerComposables.ts';
import { state } from '../models/pokerContext.ts';
import { PokerActionType } from '../models/pokerContracts.ts';
import { ActionIntent, ActionResolved } from '../models/pokerEvents.ts';
import { humanDecision } from './humanTurn.ts';
import { aiDecision } from './agentTurn.ts';

const { gameState, modules } = pokerComposables;

/** Seated player kinds; each one is played by its registered decision handler. */
export const PokerActorKind = {
  HUMAN: 'human',
  LLM: 'llm',
} as const;

/** Actor registry (Bevy `register_agent_system`): seat kind → decision handler. */
export const pokerActorHandlers = {
  [PokerActorKind.HUMAN]: humanDecision,
  [PokerActorKind.LLM]: aiDecision,
};

/** True when `path` holds the given command, as an action object or a bare string. */
export const isCommand = (path: { isCommand?: (t: string) => any } | unknown, type: string): string =>
  typeof (path as any)?.isCommand === 'function'
    ? String((path as any).isCommand(type))
    : `((${path} && ${path}.type == '${type}') || ${path} == '${type}')`;

/** Dynamic proxy indexing (Pillar 1): `TypedPathProxy<PlayerState>` with full property autocomplete. */
const activeSeat = gameState.players.at(gameState.activePlayerIdx);

/** The active seat's handler decides; the decision lands in `$state.turnAction`. */
export function decideTurn() {
  return actorRef(activeSeat, pokerActorHandlers, {
    kind: `($actor.isHuman || $actor.isInteractive) ? '${PokerActorKind.HUMAN}' : '${PokerActorKind.LLM}'`,
    as: state.turnAction,
  });
}

/** Submits the decision as an ActionIntent and waits for the table rules to resolve it (see tableRules). */
export function submitTurn() {
  return [
    ActionIntent.emit({ seatId: activeSeat.id, action: state.turnAction }),
    ActionResolved.wait(state.turnResolution),
  ];
}

/** Turn decisions that leave the betting flow instead of being submitted. */
export const turnPauses = String(state.turnAction.isCommand(PokerActionType.PAUSE));
export const turnExits = String(state.turnAction.isCommand(PokerActionType.EXIT));

/** The rules rejected the submitted action: the seat decides again. */
export const turnRejected = String(state.turnResolution.accepted.not());

export const playerTurnAst: CuratorModuleNode = defineModule(modules.PLAYER_TURN, {
  description: 'One seat\'s turn: the actor handler decides, the table rules validate and apply it',
}, () => [decideTurn(), ...submitTurn()]);
