import { defineTool, type CuratorPlugin } from '@curator/agent-server';
import type { PokerGameState, PlayerAction } from '../types.js';
import { loadCoffeeScript } from '../scripts/pokerHandScript.js';
import {
  initPokerLobby,
  joinPokerLobby,
  leavePokerLobby,
  startPokerHand,
  agenticDecidePokerAction,
  applyPokerAction,
  dealPokerStreet,
  fastForwardPokerBoard,
  distributePokerPots,
  rotatePokerDealer,
  processHumanSpeech,
  checkPokerGameOver,
  getPokerStandings,
  getLegalChoices,
} from '../engine/pokerEngine.js';

// Re-export domain logic for consumer backwards-compatibility
export * from '../engine/pokerEngine.js';

// ----------------------------------------------------------------------------
// Curator Tool Registrations
// ----------------------------------------------------------------------------

export const pokerInitLobbyTool = defineTool({
  name: 'poker_init_lobby',
  description: 'Initializes Texas Holdem lobby frame. Can accept dynamic initial players or start as an open table.',
  parameters: {
    type: 'object',
    properties: {
      tableId: { type: 'string' },
      startingChips: { type: 'number' },
      sbAmount: { type: 'number' },
      bbAmount: { type: 'number' },
      maxSeats: { type: 'number' },
      revealHandsOnSettle: { type: 'boolean' },
      maxHands: { type: 'number' },
      players: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            instruction: { type: 'string' },
            provider: { type: 'string' },
            persona: { type: 'string' },
            model: { type: 'string' },
            isHuman: { type: 'boolean' },
            chips: { type: 'number' },
            seatIdx: { type: 'number' },
          },
          required: ['id', 'name'],
        },
      },
    },
  },
  execute: async (args) => {
    return initPokerLobby(args);
  },
});

export const pokerJoinLobbyTool = defineTool({
  name: 'poker_join_lobby',
  description: 'Dynamically seats an agent or human player at the poker table with their wallet / buy-in.',
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
      player: { type: 'object' },
      id: { type: 'string' },
      name: { type: 'string' },
      instruction: { type: 'string' },
      provider: { type: 'string' },
      persona: { type: 'string' },
      model: { type: 'string' },
      isHuman: { type: 'boolean' },
      wallet: { type: 'number' },
      buyIn: { type: 'number' },
      chips: { type: 'number' },
      seatIdx: { type: 'number' },
    },
  },
  execute: async (args: any, ctx: any) => {
    const rawState = (args?.state || ctx?.state?.gameState || ctx?.context?.gameState) as PokerGameState;
    const pData = args?.player || args;
    return joinPokerLobby(rawState, pData);
  },
});

export const pokerLeaveLobbyTool = defineTool({
  name: 'poker_leave_lobby',
  description: 'Removes or cashes out a player from the poker table.',
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
      id: { type: 'string' },
    },
    required: ['id'],
  },
  execute: async (args: any, ctx: any) => {
    const rawState = (args?.state || ctx?.state?.gameState || ctx?.context?.gameState) as PokerGameState;
    const id = args.id as string;
    return leavePokerLobby(rawState, id);
  },
});

export const pokerStartHandTool = defineTool({
  name: 'poker_start_hand',
  description: 'Starts a new hand: shuffles deck, posts blinds, deals hole cards.',
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
    },
  },
  execute: async (args, ctx) => {
    const rawState = (args?.state || ctx?.state?.gameState || ctx?.context?.gameState) as PokerGameState;
    return startPokerHand(rawState);
  },
});

export const pokerAiDecisionTool = defineTool({
  name: 'poker_ai_decision',
  description: 'Calculates AI player action and ambient remark via Curator Agentic Engine.',
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
      playerIdx: { type: 'number' },
    },
  },
  execute: async (args, ctx) => {
    const rawState = (args?.state || ctx?.state?.gameState || ctx?.context?.gameState) as PokerGameState;
    const idx = args?.playerIdx ?? rawState.activePlayerIdx;
    const player = rawState.players[idx];

    const action = await agenticDecidePokerAction(player, rawState);
    return { action };
  },
});

export const pokerApplyActionTool = defineTool({
  name: 'poker_apply_action',
  description: 'Applies player action (FOLD, CHECK, CALL, RAISE, ALL_IN) to table state.',
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
      action: { type: 'object' },
    },
  },
  execute: async (args, ctx) => {
    const rawState = (args?.state || ctx?.state?.gameState || ctx?.context?.gameState) as PokerGameState;
    const action = (args?.action || ctx?.context?.lastAction || { type: 'CHECK' }) as PlayerAction;
    return applyPokerAction(rawState, action);
  },
});

export const pokerDealStreetTool = defineTool({
  name: 'poker_deal_street',
  description: 'Deals next street community cards (FLOP, TURN, RIVER) and resets street wagering.',
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
    },
  },
  execute: async (args: any, ctx: any) => {
    const rawState = (args?.state || ctx?.state?.gameState || ctx?.context?.gameState) as PokerGameState;
    return dealPokerStreet(rawState);
  },
});

export const pokerFastForwardBoardTool = defineTool({
  name: 'poker_fast_forward_board',
  description: 'Deals all remaining board cards when players are all-in.',
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
    },
  },
  execute: async (args: any, ctx: any) => {
    const rawState = (args?.state || ctx?.state?.gameState || ctx?.context?.gameState) as PokerGameState;
    return fastForwardPokerBoard(rawState);
  },
});

export const pokerDistributePotsTool = defineTool({
  name: 'poker_distribute_pots',
  description: 'Adjudicates showdown hands, allocates main and side pots, and settles chip counts.',
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
    },
  },
  execute: async (args, ctx) => {
    const rawState = (args?.state || ctx?.state?.gameState || ctx?.context?.gameState) as PokerGameState;
    return distributePokerPots(rawState);
  },
});

export const pokerRotateDealerTool = defineTool({
  name: 'poker_rotate_dealer',
  description: 'Rotates dealer button to next active seat.',
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
    },
  },
  execute: async (args, ctx) => {
    const rawState = (args?.state || ctx?.state?.gameState || ctx?.context?.gameState) as PokerGameState;
    return rotatePokerDealer(rawState);
  },
});

export const pokerHumanSpeechTool = defineTool({
  name: 'poker_human_speech',
  description: 'Applies human table talk, banter, or private whisper to the table and triggers AI persona reactions.',
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
      speechAct: { type: 'string', enum: ['TABLE_TALK', 'BANTER', 'WHISPER', 'PROVOKE'] },
      text: { type: 'string' },
      targetId: { type: 'string' },
      speakerId: { type: 'string' },
      speakerName: { type: 'string' },
    },
    required: ['speechAct', 'text'],
  },
  execute: async (args: any, ctx: any) => {
    const rawState = (args?.state || ctx?.state?.gameState || ctx?.context?.gameState) as PokerGameState;
    return processHumanSpeech(rawState, args);
  },
});

export const pokerCheckGameOverTool = defineTool({
  name: 'poker_check_game_over',
  description: 'Checks if table is down to 1 solvent player or reached max hands, compiling final standings.',
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
    },
  },
  execute: async (args, ctx) => {
    const rawState = (args?.state || ctx?.state?.gameState || ctx?.context?.gameState) as PokerGameState;
    return checkPokerGameOver(rawState);
  },
});

export const pokerGetStandingsTool = defineTool({
  name: 'poker_get_standings',
  description: 'Returns the current session standings and chip profit/loss report.',
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
    },
  },
  execute: async (args, ctx) => {
    const rawState = (args?.state || ctx?.state?.gameState || ctx?.context?.gameState) as PokerGameState;
    return getPokerStandings(rawState);
  },
});

export const pokerGetChoicesTool = defineTool({
  name: 'poker_get_choices',
  description: 'Calculates the dynamically allowed legal choices and actions for a player based on table rules',
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
      playerIdx: { type: 'number' },
    },
    required: ['state'],
  },
  execute: async (args, ctx) => {
    const rawState = (args?.state || ctx?.state?.gameState || ctx?.context?.gameState) as PokerGameState;
    return { choices: getLegalChoices(rawState, args?.playerIdx) };
  },
});

// ----------------------------------------------------------------------------
// Curator Poker Plugin Definition
// ----------------------------------------------------------------------------

export const pokerPlugin: CuratorPlugin = {
  name: 'minigame:poker',
  version: '2.0.0',
  description: 'Curator Texas Holdem Engine with Autonomous Agent Flow, Side Pots, and Dual-Track Ambient Dialogue',
  tools: {
    poker_init_lobby: pokerInitLobbyTool,
    poker_join_lobby: pokerJoinLobbyTool,
    poker_leave_lobby: pokerLeaveLobbyTool,
    poker_start_hand: pokerStartHandTool,
    poker_ai_decision: pokerAiDecisionTool,
    poker_apply_action: pokerApplyActionTool,
    poker_deal_street: pokerDealStreetTool,
    poker_fast_forward_board: pokerFastForwardBoardTool,
    poker_distribute_pots: pokerDistributePotsTool,
    poker_rotate_dealer: pokerRotateDealerTool,
    poker_human_speech: pokerHumanSpeechTool,
    poker_check_game_over: pokerCheckGameOverTool,
    poker_get_standings: pokerGetStandingsTool,
    poker_get_choices: pokerGetChoicesTool,
  },
  scripts: {
    poker_workflow: {
      name: 'poker_workflow',
      description: 'Curator Texas Hold\'em Autonomous Event-Driven 5-Phase Game Loop',
      body: loadCoffeeScript('poker_workflow.coffee'),
      run: async () => {},
    },
    poker_lobby: {
      name: 'poker_lobby',
      description: 'Poker Lobby Workflow for Table Initialization & Dynamic Seating',
      body: loadCoffeeScript('poker_lobby.coffee'),
      run: async () => {},
    },
    human_turn: {
      name: 'human_turn',
      description: 'Human Player Turn Workflow with Awaiting Events & Action Dispatch',
      body: loadCoffeeScript('human_turn.coffee'),
      run: async () => {},
    },
    agent_turn: {
      name: 'agent_turn',
      description: 'Autonomous Player Agent Turn Workflow using seated agent instruction & prompt',
      body: loadCoffeeScript('agent_turn.coffee'),
      run: async () => {},
    },
    poker_action: {
      name: 'poker_action',
      description: 'Poker Action Application & State Update Workflow',
      body: loadCoffeeScript('poker_action.coffee'),
      run: async () => {},
    },
    ambient_reaction: {
      name: 'ambient_reaction',
      description: 'Ambient Reaction & Table Talk Event Workflow',
      body: loadCoffeeScript('ambient_reaction.coffee'),
      run: async () => {},
    },
  },
};
