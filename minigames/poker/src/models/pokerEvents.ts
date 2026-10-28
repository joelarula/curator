/**
 * Typed poker events (Bevy `Message`s) and state machines (Bevy `States`): one wire name and one payload shape per event.
 * Workflows emit, wait and subscribe through these handles, so payload keys are checked at compile time.
 */
import { defineEvent, defineStates } from '../curator.ts';
import type { PlayerAction, PlayerStanding, PokerGameState, SpeechAct, Street } from '../types.ts';
import { PokerEvent, PokerTablePhase, PokerLobbyPhase, TABLE_PHASE_KEY, LOBBY_PHASE_KEY } from './pokerContracts.ts';

type TableRef = { tableId: string };

// Table lifecycle
export const LobbyReady = defineEvent<TableRef>(PokerEvent.LOBBY_READY);
export const AwaitingPlayers = defineEvent<TableRef & { seatedCount: number }>(PokerEvent.AWAITING_PLAYERS);
export const PlayerJoined = defineEvent<{ id?: string; name: string; isHuman?: boolean }>(PokerEvent.PLAYER_JOINED);
export const TableReady = defineEvent<TableRef & { playerCount: number }>(PokerEvent.TABLE_READY);
export const TableSelected = defineEvent<TableRef & { buyIn?: number }>(PokerEvent.TABLE_SELECTED);

// Hand & streets
export const NewRound = defineEvent<{ handNumber: number; gameState: PokerGameState }>(PokerEvent.NEW_ROUND);
export const PhaseDeal = defineEvent<{ street: Street; gameState: PokerGameState }>(PokerEvent.PHASE_DEAL);
export const PhaseStreet = defineEvent<{ street: Street; gameState: PokerGameState }>(PokerEvent.PHASE_STREET);
export const PhaseSettle = defineEvent<{ winnerSummary: string; gameState: PokerGameState }>(PokerEvent.PHASE_SETTLE);
export const GameOver = defineEvent<{ standings: PlayerStanding[] }>(PokerEvent.GAME_OVER);

// Turns & actions
export const AwaitingHumanAction = defineEvent<{ gameState: PokerGameState }>(PokerEvent.AWAITING_HUMAN_ACTION);
export const ActionApplied = defineEvent<{ player: string; action: PlayerAction; pot: number }>(PokerEvent.ACTION_APPLIED);
export const ActionTaken = defineEvent<{ player: string; action: PlayerAction; summary: string; pot?: number; gameState: PokerGameState }>(PokerEvent.ACTION_TAKEN);

// Session control
export const TablePaused = defineEvent<TableRef>(PokerEvent.TABLE_PAUSED);
export const ResumeAction = defineEvent<{ type: 'RESUME' | 'EXIT' | string }>(PokerEvent.RESUME_ACTION);
export const TableResumed = defineEvent<TableRef>(PokerEvent.TABLE_RESUMED);
export const SessionExited = defineEvent<{ reason: string }>(PokerEvent.SESSION_EXITED);

// Table talk
export const Speech = defineEvent<{ speakerId?: string; speakerName: string; text: string; speechAct: SpeechAct; targetId?: string }>(PokerEvent.SPEECH);
export const AmbientSpoken = defineEvent<{ speaker: string; speechAct: SpeechAct; text: string }>(PokerEvent.AMBIENT_SPOKEN);
export const AmbientEvaluated = defineEvent<{ player: string; action: PlayerAction }>(PokerEvent.AMBIENT_EVALUATED);

// Action pipeline: a seat's intent is validated, then applied (or rejected back to the seat)
type SeatAction = { seatId: string; action: PlayerAction };
export const ActionIntent = defineEvent<SeatAction>(PokerEvent.ACTION_INTENT);
export const ActionValidated = defineEvent<SeatAction>(PokerEvent.ACTION_VALIDATED);
export const ActionRejected = defineEvent<SeatAction & { reason: string }>(PokerEvent.ACTION_REJECTED);
/** Ends a submitted turn either way; the table waits for it. */
export const ActionResolved = defineEvent<{ seatId: string; accepted: boolean; reason?: string }>(PokerEvent.ACTION_RESOLVED);

// State machines (Bevy `States`): run conditions and enter/exit triggers for systems
export const TablePhase = defineStates(TABLE_PHASE_KEY, PokerTablePhase);
export const LobbyPhase = defineStates(LOBBY_PHASE_KEY, PokerLobbyPhase);
