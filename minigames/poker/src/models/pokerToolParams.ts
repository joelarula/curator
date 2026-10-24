/**
 * Typed Parameter Models for all Texas Hold'em Tools.
 * Single source of truth for tool arguments, validation schemas, and workflow composables.
 */

import type { PokerGameState, PlayerAction, SpeechAct, PlayerState } from '../types.ts';
import type { PokerTool } from './pokerTools.ts';

export type WorkflowValue<T> = T | string;

export interface PokerInitialPlayerInput {
  id: string;
  name: string;
  instruction?: string;
  provider?: string;
  persona?: string;
  model?: string;
  isHuman?: boolean;
  chips?: number;
  wallet?: number;
  buyIn?: number;
  seatIdx?: number;
}

export interface PokerInitLobbyParams {
  tableId?: WorkflowValue<string>;
  startingChips?: WorkflowValue<number>;
  sbAmount?: WorkflowValue<number>;
  bbAmount?: WorkflowValue<number>;
  maxSeats?: WorkflowValue<number>;
  revealHandsOnSettle?: WorkflowValue<boolean>;
  maxHands?: WorkflowValue<number>;
  players?: WorkflowValue<PokerInitialPlayerInput[]>;
  wallets?: Record<string, number>;
  startingWallets?: Record<string, number>;
  playerName?: string;
}

export interface PokerJoinLobbyParams {
  state?: WorkflowValue<PokerGameState>;
  player?: WorkflowValue<PokerInitialPlayerInput | PlayerState>;
  id?: string;
  name?: string;
  instruction?: string;
  provider?: string;
  persona?: string;
  model?: string;
  isHuman?: boolean;
  wallet?: number;
  buyIn?: number;
  chips?: number;
  seatIdx?: number;
}

export interface PokerLeaveLobbyParams {
  state?: WorkflowValue<PokerGameState>;
  id: WorkflowValue<string>;
}

export interface PokerStartHandParams {
  state?: WorkflowValue<PokerGameState>;
}

export interface PokerAiDecisionParams {
  state?: WorkflowValue<PokerGameState>;
  playerIdx?: WorkflowValue<number>;
}

export interface PokerApplyActionParams {
  state?: WorkflowValue<PokerGameState>;
  action?: WorkflowValue<PlayerAction>;
}

export interface PokerDealStreetParams {
  state?: WorkflowValue<PokerGameState>;
}

export interface PokerFastForwardParams {
  state?: WorkflowValue<PokerGameState>;
}

export interface PokerDistributePotsParams {
  state?: WorkflowValue<PokerGameState>;
}

export interface PokerRotateDealerParams {
  state?: WorkflowValue<PokerGameState>;
}

export interface PokerHumanSpeechParams {
  state?: WorkflowValue<PokerGameState>;
  speechAct: WorkflowValue<SpeechAct>;
  text: WorkflowValue<string>;
  targetId?: WorkflowValue<string>;
  speakerId?: WorkflowValue<string>;
  speakerName?: WorkflowValue<string>;
}

export interface PokerCheckGameOverParams {
  state?: WorkflowValue<PokerGameState>;
}

export interface PokerGetStandingsParams {
  state?: WorkflowValue<PokerGameState>;
}

export interface PokerGetChoicesParams {
  state?: WorkflowValue<PokerGameState>;
  playerIdx?: WorkflowValue<number>;
}

export interface PokerListTablesParams {}

export interface PokerToolParamsMap {
  [PokerTool.INIT_LOBBY]: PokerInitLobbyParams;
  [PokerTool.JOIN_LOBBY]: PokerJoinLobbyParams;
  [PokerTool.LEAVE_LOBBY]: PokerLeaveLobbyParams;
  [PokerTool.START_HAND]: PokerStartHandParams;
  [PokerTool.DEAL_STREET]: PokerDealStreetParams;
  [PokerTool.FAST_FORWARD]: PokerFastForwardParams;
  [PokerTool.DISTRIBUTE_POTS]: PokerDistributePotsParams;
  [PokerTool.ROTATE_DEALER]: PokerRotateDealerParams;
  [PokerTool.AI_DECISION]: PokerAiDecisionParams;
  [PokerTool.APPLY_ACTION]: PokerApplyActionParams;
  [PokerTool.HUMAN_SPEECH]: PokerHumanSpeechParams;
  [PokerTool.CHECK_GAME_OVER]: PokerCheckGameOverParams;
  [PokerTool.GET_STANDINGS]: PokerGetStandingsParams;
  [PokerTool.GET_CHOICES]: PokerGetChoicesParams;
  [PokerTool.LIST_TABLES]: PokerListTablesParams;
}
