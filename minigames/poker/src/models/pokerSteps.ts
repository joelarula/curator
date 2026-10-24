/**
 * Poker Step, Subroutine, and Module Identifiers
 * Eliminates string literals for sequential steps, subroutines, and module names.
 */

export const PokerModule = {
  WORKFLOW: 'poker_workflow',
  LOBBY: 'poker_lobby',
  ACTION: 'poker_action',
  HUMAN_TURN: 'human_turn',
  AGENT_TURN: 'agent_turn',
  AMBIENT_REACTION: 'ambient_reaction',
} as const;

export type PokerModuleType = (typeof PokerModule)[keyof typeof PokerModule];

export const PokerSubroutine = {
  HANDLE_PAUSE: '#handle_pause',
  AI_AGENT_FLOW: '#ai_agent_flow',
  DEAL_NEXT_STREET: '#deal_next_street',
  SETTLE_SHOWDOWN: '#settle_showdown',
  ON_SPEECH_EVENT: '#on_speech_event',
  ON_ACTION_TAKEN: '#on_action_taken',
} as const;

export type PokerSubroutineType = (typeof PokerSubroutine)[keyof typeof PokerSubroutine];

export const PokerStep = {
  // Action Module Steps
  APPLY_ACTION_STEP: 'poker:apply_action_step',
  APPLY_ACTION: 'poker:apply_action',

  // Lobby Module Steps
  LOBBY_MANAGER: 'poker:lobby_manager',
  LOBBY_GATE: 'poker:lobby_gate',
  EXIT_LOBBY: 'poker:exit_lobby',
  RESUME_TABLE_FLOW: 'poker:resume_table_flow',
  NEW_TABLE_FLOW: 'poker:new_table_flow',
  BOOT_TABLE: 'poker:boot_table',
  WAIT_FOR_PLAYERS: 'poker:wait_for_players',

  // Human Turn Steps
  HUMAN_TURN: 'poker:human_turn',
  HANDLE_PAUSE: 'poker:handle_pause',
  WAIT_RESUME: 'poker:wait_resume',
  UNPAUSE: 'poker:unpause',
  PAUSE_EXIT: 'poker:pause_exit',
  HANDLE_EXIT: 'poker:handle_exit',

  // Agent Turn Steps
  AGENT_TURN: 'poker:agent_turn',

  // Ambient Reaction Steps
  AMBIENT_REACTION: 'poker:ambient_reaction',
  HANDLE_SPEECH_EVENT: 'poker:handle_speech_event',
  HANDLE_ACTION_EVENT: 'poker:handle_action_event',

  // Master Workflow Engine Steps
  DYNAMIC_ENGINE: 'poker:dynamic_engine',
  SINGLE_HAND: 'poker:single_hand',
  STREET_LOOP: 'poker:street_loop',
  TURN_STEP: 'poker:turn_step',
  HUMAN_AGENT_FLOW: 'poker:human_agent_flow',
  AI_AGENT_FLOW: 'poker:ai_agent_flow',
  DEAL_NEXT_STREET: 'poker:deal_next_street',
  SETTLE_SHOWDOWN: 'poker:settle_showdown',
  PHASE_SETTLE_STEP: 'poker:phase_settle_step',
} as const;

export type PokerStepType = (typeof PokerStep)[keyof typeof PokerStep];
