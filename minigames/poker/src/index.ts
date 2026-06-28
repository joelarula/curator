import type { CuratorPlugin } from '@curator/agent-server';
import { deal_cards, reveal_community, apply_bet } from './tools/poker_tools.js';

export const pokerPlugin: CuratorPlugin = {
  name: 'minigame:poker',
  tools: {
    deal_cards,
    reveal_community,
    apply_bet
  }
};
