import {
  type CuratorPlugin,
  type CuratorScriptDefinition,
  CuratorSystemRole,
} from '../curator.ts';
import {
  PokerModule,
  PokerTool,
  PokerRole,
} from '../models/index.ts';
import { POKER_WORKFLOW_ASTS } from '../workflows/index.ts';
import { PokerTableShape, PokerBankrollShape } from '../models/pokerShapes.ts';
import { pokerTableProjector } from '../services/pokerTableStore.ts';
import { POKER_AGENT_PROFILES } from '../workflows/agentProfiles.ts';
import { pokerTools, pokerReducers } from './pokerTools.ts';
import { pokerNodeHandlers } from './pokerNodes.ts';
import { resolvePokerConfig, POKER_CONFIG_NAMESPACE } from '../pokerConfig.ts';

export * from './pokerTools.ts';
export * from './pokerNodes.ts';

const SCRIPT_DESCRIPTIONS: Record<string, string> = {
  [PokerModule.WORKFLOW]: 'Texas Holdem master game loop and table manager AST workflow',
  [PokerModule.LOBBY]: 'Texas Holdem lounge concierge and table seating AST workflow',
  [PokerModule.PLAYER_TURN]: 'Universal Texas Holdem player turn AST workflow',
  [PokerModule.HUMAN_TURN]: 'Human player turn handler AST workflow',
  [PokerModule.AGENT_TURN]: 'AI Agent turn handler AST workflow',
  [PokerModule.RULES]: 'Table rules systems: validate and apply action intents',
  [PokerModule.AMBIENT_REACTION]: 'Table spectator chatter and ambient reaction AST workflow',
};

/**
 * Pre-compiled typed TypeScript workflow AST definitions for Texas Hold'em.
 * Synced automatically with canonical POKER_WORKFLOW_ASTS.
 */
export const pokerScripts: Record<string, CuratorScriptDefinition> = Object.fromEntries(
  Object.entries(POKER_WORKFLOW_ASTS).map(([name, ast]) => [
    name,
    {
      name,
      description: SCRIPT_DESCRIPTIONS[name] || `Texas Holdem AST workflow for ${name}`,
      ast,
      run: async () => {},
    },
  ])
);

export const pokerPlugin: CuratorPlugin = {
  name: 'minigame:poker',
  version: '2.0.0',
  description: 'Curator Texas Holdem Engine with Autonomous Agent Flow, Side Pots, and Dual-Track Ambient Dialogue',
  roles: {
    [PokerRole.ADMIN]: {
      name: PokerRole.ADMIN,
      description: 'Poker Lounge Administrator with unrestricted table controls and configuration privileges',
      subRoles: [PokerRole.DEALER],
    },
    [PokerRole.DEALER]: {
      name: PokerRole.DEALER,
      description: 'Table Dealer responsible for deck management, dealing cards, and pot settlements',
      subRoles: [PokerRole.PLAYER],
    },
    [PokerRole.PLAYER]: {
      name: PokerRole.PLAYER,
      description: 'Active seated player eligible to wager chips and engage in table banter',
      subRoles: [PokerRole.SPECTATOR],
      tools: [
        PokerTool.DEPOSIT_BUY_IN,
        PokerTool.CASH_OUT,
        PokerTool.RELOAD_BANKROLL,
        PokerTool.CLOSE_TABLE,
      ],
    },
    [PokerRole.SPECTATOR]: {
      name: PokerRole.SPECTATOR,
      description: 'Spectator observing table action, discovery, and leaderboard standings',
      tools: [
        PokerTool.LIST_TABLES,
        PokerTool.GET_STANDINGS,
        PokerTool.GET_RULES,
        PokerTool.GET_BANKROLL,
        PokerTool.GET_BUY_IN_OPTIONS,
      ],
    },
  },
  defaultUserRoles: [PokerRole.PLAYER, PokerRole.SPECTATOR],
  systemRoles: [
    CuratorSystemRole.ADMIN,
    PokerRole.ADMIN,
    PokerRole.DEALER,
    PokerRole.PLAYER,
    PokerRole.SPECTATOR,
  ],
  tools: pokerTools,
  reducers: pokerReducers,
  /** Table steps run as `Poker_Table` nodes (reducer + state + events in one request). */
  nodeHandlers: pokerNodeHandlers,
  /** Defaults for `$config.poker`; the host layers `poker.config.json` and its options over them. */
  config: { [POKER_CONFIG_NAMESPACE]: resolvePokerConfig() },
  models: [PokerTableShape, PokerBankrollShape],
  stateProjectors: [pokerTableProjector],
  scripts: pokerScripts,
  agents: Object.fromEntries(
    Object.entries(POKER_AGENT_PROFILES)
      .filter(([_, profile]) => !profile.isHuman)
      .map(([key, profile]) => [
        key,
        {
          ...profile,
          ...(profile.scriptName && POKER_WORKFLOW_ASTS[profile.scriptName]
            ? { ast: POKER_WORKFLOW_ASTS[profile.scriptName] }
            : {}),
        },
      ])
  ) as any,
};
