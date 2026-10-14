import type { CuratorPlugin } from '../../engine/CuratorEngine.js';
import { evalBlackjackTool, evalPokerTool, evalTrickTool } from './tools.js';
import { tabletopVocabularies } from './GameComposables.js';

export * from './tools.js';
export * from './FluentGameBuilder.js';
export * from './GameComposables.js';

/**
 * Curator Tabletop & Card Game Domain Plugin.
 * Exposes universal 5-phase game state machine composables and deterministic rule evaluators.
 */
export const tabletopPlugin: CuratorPlugin = {
  name: 'tabletop',
  version: '1.0.0',
  description: 'Universal 5-Phase Tabletop & Card Game State Machine Plugin for Curator swarms',
  tools: {
    eval_blackjack: evalBlackjackTool,
    eval_poker: evalPokerTool,
    eval_trick: evalTrickTool,
  },
  vocabularies: tabletopVocabularies,
};
