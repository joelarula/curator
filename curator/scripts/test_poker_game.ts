import type { CuratorGraphNode, CuratorSequentialNode } from '../src/engine/CuratorAst.js';

// A betting round for 3 players, each targeting a specific userId
function bettingRound(phase: string): CuratorSequentialNode {
  return {
    type: 'Curator_Sequential',
    name: `${phase}_betting`,
    subAgents: [
      {
        type: 'Curator_HumanInput',
        prompt: `[${phase.toUpperCase()}] Player 1 — Community: {state.community}. Your hand: {state.hand_1}. Pot: {state.pot}. Action? (fold/call/raise <amount>)`,
        targetUserId: 1,
        inputType: 'text'
      },
      {
        type: 'Curator_Tool',
        toolName: 'apply_bet',
        args: { player: 1, action: '{context.input}' }
      },
      {
        type: 'Curator_HumanInput',
        prompt: `[${phase.toUpperCase()}] Player 2 — Community: {state.community}. Your hand: {state.hand_2}. Pot: {state.pot}. Action?`,
        targetUserId: 2,
        inputType: 'text'
      },
      {
        type: 'Curator_Tool',
        toolName: 'apply_bet',
        args: { player: 2, action: '{context.input}' }
      },
      {
        type: 'Curator_HumanInput',
        prompt: `[${phase.toUpperCase()}] Player 3 — Community: {state.community}. Your hand: {state.hand_3}. Pot: {state.pot}. Action?`,
        targetUserId: 3,
        inputType: 'text'
      },
      {
        type: 'Curator_Tool',
        toolName: 'apply_bet',
        args: { player: 3, action: '{context.input}' }
      }
    ]
  };
}

export function run(): CuratorGraphNode {
  return {
    type: 'Curator_Graph',
    name: 'Poker Game',
    startNode: 'deal',
    nodes: {
      deal: {
        type: 'Curator_Tool',
        toolName: 'deal_cards',
        args: { players: 3, cards_per_player: 2 }
      },

      preflop: bettingRound('preflop'),
      
      flop: {
        type: 'Curator_Tool',
        toolName: 'reveal_community',
        args: { count: 3 }
      },
      flop_bets: bettingRound('flop'),
      
      turn: {
        type: 'Curator_Tool',
        toolName: 'reveal_community',
        args: { count: 1 }
      },
      turn_bets: bettingRound('turn'),
      
      river: {
        type: 'Curator_Tool',
        toolName: 'reveal_community',
        args: { count: 1 }
      },
      river_bets: bettingRound('river'),
      
      showdown: {
        type: 'Curator_Agent',
        prompt: 'Evaluate the poker hands. Community cards: {state.community}. Player 1: {state.hand_1}. Player 2: {state.hand_2}. Player 3: {state.hand_3}. Active players: {state.active_players}. Pot: {state.pot}. Who wins and why?'
      }
    },
    edges: {
      deal:       'preflop',
      preflop:    'flop',
      flop:       'flop_bets',
      flop_bets:  'turn',
      turn:       'turn_bets',
      turn_bets:  'river',
      river:      'river_bets',
      river_bets: 'showdown',
      showdown:   '__end__'
    }
  };
}
