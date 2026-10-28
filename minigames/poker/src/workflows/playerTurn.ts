/**
 * ---
 * id: player_turn
 * name: player_turn
 * description: One seat's turn - the seat's actor handler decides, the table applies the action
 * ---
 */
import { defineModule, actorRef, type CuratorModuleNode } from '../curator.ts';
import { pokerComposables } from '../composables/pokerComposables.ts';
import { state } from '../models/pokerContext.ts';
import { PokerActionType } from '../models/pokerContracts.ts';
import { ActionTaken } from '../models/pokerEvents.ts';
import { humanDecision } from './humanTurn.ts';
import { aiDecision } from './agentTurn.ts';

const { gameState, apply_player_action, modules } = pokerComposables;

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
export const isCommand = (path: unknown, type: string) => `((${path} && ${path}.type == '${type}') || ${path} == '${type}')`;

/** The active seat's handler decides; the decision lands in `$state.turnAction`. */
export function decideTurn() {
  return actorRef(`${gameState.players}[${gameState.activePlayerIdx}]`, pokerActorHandlers, {
    kind: `($actor.isHuman || $actor.isInteractive) ? '${PokerActorKind.HUMAN}' : '${PokerActorKind.LLM}'`,
    as: state.turnAction,
  });
}

/** Applies the decided action to the table and announces it. */
export function applyTurn() {
  return [
    apply_player_action(state.turnAction),
    ActionTaken.emit({
      player: `${gameState.lastActorName} || ${gameState.players}[${gameState.activePlayerIdx}].name`,
      action: state.turnAction,
      summary: gameState.lastActionSummary,
      gameState,
    }),
  ];
}

/** Turn decisions that leave the betting flow instead of being applied. */
export const turnPauses = isCommand(state.turnAction, PokerActionType.PAUSE);
export const turnExits = isCommand(state.turnAction, PokerActionType.EXIT);

export const playerTurnAst: CuratorModuleNode = defineModule(modules.PLAYER_TURN, {
  description: 'One seat\'s turn: the actor handler decides, then the action is applied',
}, () => [decideTurn(), ...applyTurn()]);
