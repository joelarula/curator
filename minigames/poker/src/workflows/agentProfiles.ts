/**
 * Canonical Poker Agent Profiles and Default Seated Player Presets.
 * Single source of truth for Texas Hold'em characters, personas, instructions, and roles.
 */

import { PokerRole, PokerModule } from '../models/index.ts';
import {
  POKER_AI_PROFILES,
  DEFAULT_AI_PLAYERS,
  type PokerAgentProfile,
} from './agentTurn.ts';

export {
  POKER_AI_PROFILES,
  DEFAULT_AI_PLAYERS,
  type PokerAgentProfile,
};

export const POKER_AGENT_PROFILES: Record<string, PokerAgentProfile> = {
  hero: {
    id: 'hero',
    name: 'You (Hero)',
    scriptName: PokerModule.HUMAN_TURN,
    schedule: 'manual',
    enabled: true,
    instruction: 'You are the human player (Hero) at the high-roller poker table.',
    persona: 'human',
    isHuman: true,
    roles: [PokerRole.PLAYER, PokerRole.SPECTATOR],
  },
  lobby: {
    id: 'lobby',
    name: 'Lobby (Concierge)',
    scriptName: PokerModule.LOBBY,
    schedule: 'manual',
    enabled: true,
    instruction:
      "You are the Texas Hold'em Lounge Concierge. You welcome players to the poker lounge, explain available tables and game formats, assist with table seating, buy-ins, and direct players to active games.",
    persona: 'concierge',
    roles: [PokerRole.ADMIN, PokerRole.SPECTATOR],
  },
  dealer: {
    id: 'dealer',
    name: 'Dealer (House)',
    scriptName: PokerModule.WORKFLOW,
    schedule: 'manual',
    enabled: true,
    instruction:
      "You are the professional Texas Hold'em table dealer. You run the table, deal community cards, announce pot amounts and street actions, and answer table inquiries politely and authoritatively.",
    persona: 'dealer',
    roles: [PokerRole.DEALER, PokerRole.SPECTATOR],
  },
  ...POKER_AI_PROFILES,
};

/**
 * Default four seated players at the table: Hero (human) + 3 autonomous AI agents.
 */
export const DEFAULT_TABLE_PLAYERS: PokerAgentProfile[] = [
  POKER_AGENT_PROFILES.hero,
  ...DEFAULT_AI_PLAYERS,
];
