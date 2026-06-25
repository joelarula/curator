import type { CuratorGraphNode } from '../src/engine/CuratorAst.js';

// --- Reusable TypeScript Logic for Script Nodes ---

function getBettingSequence(state: any, phase: string) {
  const active = state.active_players || [1, 2, 3];
  if (phase !== 'PREFLOP' && active.length <= 1) {
    return { type: 'Curator_Sequential', subAgents: [] };
  }
  
  const dealer = state.dealer_index || 0;
  const order: number[] = [];
  for (let i = 1; i <= active.length; i++) {
    order.push(active[(dealer + i) % active.length]);
  }

  const subAgents = order.flatMap(p => [
    {
      type: 'Curator_Agent',
      priority: 10,
      prompt: `[${phase}] You are Player ${p}. You are playing Texas Hold'em against other AI agents.
Community cards are: ${JSON.stringify(state.community)}.
Your hand is: ${JSON.stringify(state['hand_' + p])}.
Pot is ${state.pot}. Current bets by player: ${JSON.stringify(state.bets)}.
Active players: ${JSON.stringify(state.active_players)}.

Decide your next action (fold, call, or raise).
Return ONLY a valid JSON object matching this schema:
{"action": "fold" | "call" | "raise", "amount": number}
If you fold or call, amount should be 0. If you raise, specify the additional raise amount (e.g., 20).`
    },
    {
      type: 'Curator_Tool',
      toolName: 'apply_bet',
      args: { player: p, action: '{context.input}' }
    }
  ]);

  return { type: 'Curator_Sequential', subAgents };
}

function rotateDealerLogic(state: any) {
  const currentDealer = state.dealer_index || 0;
  return {
    type: 'Curator_SetState',
    state: { dealer_index: (currentDealer + 1) % 3 }
  };
}

function loopCheckLogic(state: any) {
  const handsPlayed = state.hand_number || 1;
  return handsPlayed >= 2 ? 'end_game' : 'next_hand';
}


// --- Main Graph Definition ---

export function run(): CuratorGraphNode {
  return {
    type: 'Curator_Graph',
    name: 'Multi-Agent Poker Game',
    startNode: 'deal',
    nodes: {
      deal: {
        type: 'Curator_Tool',
        toolName: 'deal_cards',
        args: { players: 3, cards_per_player: 2 }
      },

      preflop: {
        type: 'Curator_Script',
        language: 'javascript',
        code: `(${getBettingSequence.toString()})(state, 'PREFLOP')`
      },
      
      flop: {
        type: 'Curator_Tool',
        toolName: 'reveal_community',
        args: { count: 3 }
      },
      
      flop_bets: {
        type: 'Curator_Script',
        language: 'javascript',
        code: `(${getBettingSequence.toString()})(state, 'FLOP')`
      },
      
      turn: {
        type: 'Curator_Tool',
        toolName: 'reveal_community',
        args: { count: 1 }
      },
      
      turn_bets: {
        type: 'Curator_Script',
        language: 'javascript',
        code: `(${getBettingSequence.toString()})(state, 'TURN')`
      },
      
      river: {
        type: 'Curator_Tool',
        toolName: 'reveal_community',
        args: { count: 1 }
      },
      
      river_bets: {
        type: 'Curator_Script',
        language: 'javascript',
        code: `(${getBettingSequence.toString()})(state, 'RIVER')`
      },
      
      showdown: {
        type: 'Curator_Agent',
        prompt: 'Evaluate the final poker hands for this hand. Community cards: {state.community}. Active players: {state.active_players}. Player 1: {state.hand_1}. Player 2: {state.hand_2}. Player 3: {state.hand_3}. Pot: {state.pot}. Determine the winning hand and summarize the outcome.'
      },

      rotate_dealer: {
        type: 'Curator_Script',
        language: 'javascript',
        code: `(${rotateDealerLogic.toString()})(state)`
      }
    },
    edges: {
      deal:          'preflop',
      preflop:       'flop',
      flop:          'flop_bets',
      flop_bets:     'turn',
      turn:          'turn_bets',
      turn_bets:     'river',
      river:         'river_bets',
      river_bets:    'showdown',
      showdown:      'rotate_dealer',
      rotate_dealer: {
        type: 'Curator_Script',
        language: 'javascript',
        code: `(${loopCheckLogic.toString()})(state)`
      }
    }
  };
}
