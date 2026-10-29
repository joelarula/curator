/**
 * ---
 * id: poker_workflow
 * name: poker_workflow
 * description: Curator Texas Hold'em Autonomous Event-Driven 5-Phase Game Loop Module
 * ---
 */
import { state } from '../models/pokerContext.ts';
import { PokerActionType, PokerTablePhase } from '../models/pokerContracts.ts';
import { GameOver, TablePaused, TableResumed, ResumeAction, TablePhase } from '../models/pokerEvents.ts';
import {
  defineModule,
  seq,
  ifElse,
  stateMachine,
  setState,
  type CuratorModuleNode,
} from '../curator.ts';
import { pokerComposables } from '../composables/pokerComposables.ts';
import { buildTableBootStep } from './pokerLobby.ts';
import { decideTurn, submitTurn, isCommand, turnPauses, turnExits, turnRejected } from './playerTurn.ts';

const {
  gameState,
  is_game_active,
  start_hand,
  handle_user_exit,
  modules,
  steps,
} = pokerComposables;

const resumes = isCommand(state.resumeCmd, PokerActionType.RESUME);

// The next seat decides while the session lasts; otherwise the summary (exit closes rather than finishes).
const sessionTransitions = [
  { to: PokerTablePhase.BETTING, when: is_game_active },
  { to: PokerTablePhase.GAME_OVER },
];

/**
 * Texas Hold'em table as a Bevy-style state machine; the active phase is mirrored into
 * `$state.tablePhase` so other flows can gate on it.
 * Only seat decisions, pausing and leaving are states here: dealing, settling and starting the next hand
 * happen inside the table reducer (engine/pokerTable.ts) whenever an action is applied.
 */
export function buildTablePhases() {
  return stateMachine(PokerTablePhase.BOOT, {
    // Initialize open table if state not yet booted, then deal the first hand (a running one is kept)
    [PokerTablePhase.BOOT]: {
      run: [buildTableBootStep(), ifElse(is_game_active, start_hand())],
      next: sessionTransitions,
    },
    // A seat's turn: its actor handler decides; pausing and leaving are table states, not flags
    [PokerTablePhase.BETTING]: {
      run: decideTurn(),
      next: [
        { to: PokerTablePhase.PAUSED, when: turnPauses },
        { to: PokerTablePhase.EXITED, when: turnExits },
        { to: PokerTablePhase.SUBMIT },
      ],
    },
    // The table rules (systems) validate and apply the intent; a rejected one goes back to the seat
    [PokerTablePhase.SUBMIT]: {
      run: submitTurn(),
      next: [{ to: PokerTablePhase.BETTING, when: turnRejected }, ...sessionTransitions],
    },
    [PokerTablePhase.PAUSED]: {
      onEnter: [setState({ isPaused: true }), TablePaused.emit({ tableId: gameState.tableId })],
      run: ResumeAction.wait(state.resumeCmd),
      onExit: [
        setState({ isPaused: false }),
        ifElse(resumes, TableResumed.emit({ tableId: gameState.tableId })),
      ],
      next: [
        { to: PokerTablePhase.BETTING, when: resumes },
        { to: PokerTablePhase.EXITED, when: isCommand(state.resumeCmd, PokerActionType.EXIT) },
        { to: PokerTablePhase.PAUSED },
      ],
    },
    // Leaving closes the table rather than finishing the game
    [PokerTablePhase.EXITED]: { run: handle_user_exit() },
    [PokerTablePhase.GAME_OVER]: {
      run: [
        setState({ gameOver: gameState.gameOver }),
        // The reducer commits the final standings into gameState.finalStandings
        GameOver.emit({ standings: gameState.finalStandings }),
      ],
    },
  }, { name: steps.TABLE_PHASES, stateKey: TablePhase });
}

/** The table app: its game-loop state machine (the rules run beside it as systems, see tableRules). */
export function buildPokerWorkflowModule(): CuratorModuleNode {
  return defineModule(modules.WORKFLOW, {
    description: "Curator Texas Hold'em table: game-loop state machine",
  }, () => seq(steps.DYNAMIC_ENGINE, [buildTablePhases()]));
}

export const pokerWorkflowAst = buildPokerWorkflowModule();

