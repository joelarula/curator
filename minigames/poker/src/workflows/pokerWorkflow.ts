/**
 * ---
 * id: poker_workflow
 * name: poker_workflow
 * description: Curator Texas Hold'em Autonomous Event-Driven 5-Phase Game Loop Module
 * ---
 */
import { state, tableCtx } from '../models/pokerContext.ts';
import { PokerActionType, PokerTablePhase } from '../models/pokerContracts.ts';
import { NewRound, PhaseDeal, PhaseStreet, PhaseSettle, GameOver, TablePaused, TableResumed, ResumeAction, TablePhase } from '../models/pokerEvents.ts';
import {
  defineModule,
  defineSubroutine,
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
  is_hand_active,
  is_street_active,
  start_poker_hand,
  deal_next_street,
  settle_showdown,
  check_game_over,
  rotate_dealer,
  handle_user_exit,
  modules,
  steps,
} = pokerComposables;


/**
 * Subroutine for dealing the next street community cards.
 */
export const dealNextStreetSub = defineSubroutine('deal_next_street', {
  defaultMode: 'inline',
  body: seq(steps.DEAL_NEXT_STREET, [
    deal_next_street(),
    PhaseStreet.emit({ street: gameState.currentStreet, gameState }),
  ]),
});

/**
 * Subroutine for showdown adjudication and pot allocation.
 */
export const settleShowdownSub = defineSubroutine('settle_showdown', {
  defaultMode: 'inline',
  body: seq(steps.PHASE_SETTLE_STEP, [
    settle_showdown(),
    PhaseSettle.emit({ winnerSummary: tableCtx.winnerSummary, gameState }),
  ]),
});

const resumes = isCommand(state.resumeCmd, PokerActionType.RESUME);

// After any wagering step: next player turn, next street, or showdown.
const streetTransitions = [
  { to: PokerTablePhase.BETTING, when: `(${is_hand_active}) and (${is_street_active})` },
  { to: PokerTablePhase.DEAL_STREET, when: is_hand_active },
  { to: PokerTablePhase.SETTLE },
];

// Another hand while the session lasts; otherwise the summary (exit closes rather than finishes).
const sessionTransitions = [
  { to: PokerTablePhase.START_HAND, when: is_game_active },
  { to: PokerTablePhase.GAME_OVER },
];

/**
 * Texas Hold'em game loop as a Bevy-style state machine; the active phase is mirrored into
 * `$state.tablePhase` so other flows can gate on it.
 */
export function buildTablePhases() {
  return stateMachine(PokerTablePhase.BOOT, {
    // Initialize open table if state not yet booted
    [PokerTablePhase.BOOT]: { run: buildTableBootStep(), next: sessionTransitions },
    [PokerTablePhase.START_HAND]: {
      run: [
        start_poker_hand(),
        NewRound.emit({ handNumber: gameState.handNumber, gameState }),
        PhaseDeal.emit({ street: gameState.currentStreet, gameState }),
      ],
      next: streetTransitions,
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
      next: [{ to: PokerTablePhase.BETTING, when: turnRejected }, ...streetTransitions],
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
    [PokerTablePhase.DEAL_STREET]: { run: dealNextStreetSub(), next: streetTransitions },
    [PokerTablePhase.SETTLE]: { run: settleShowdownSub(), next: PokerTablePhase.CLOSE_HAND },
    // Standings, then the button rotates on the way out of every hand
    [PokerTablePhase.CLOSE_HAND]: { run: check_game_over(), onExit: rotate_dealer(), next: sessionTransitions },
    [PokerTablePhase.GAME_OVER]: {
      run: [
        setState({ gameOver: gameState.gameOver }),
        // check_game_over commits its standings into gameState.finalStandings
        GameOver.emit({ standings: `${gameState.finalStandings} || ${tableCtx.standings}` }),
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

