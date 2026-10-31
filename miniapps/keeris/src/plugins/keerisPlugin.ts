import {
  type CuratorPlugin,
  type CuratorScriptDefinition,
  CuratorSystemRole,
} from '@curator/agent-server';
import { KeerisRole, KeerisTool, KeerisModule } from '../models/index.ts';
import { KEERIS_WORKFLOW_ASTS } from '../workflows/index.ts';
import { KEERIS_WHITELISTED_TOOLS } from './keerisTools.ts';
import { RADIO_PROGRAMS } from './manifest.ts';
import { buildPipelineScrapeAST } from '../workflows/index.ts';

const SCRIPT_DESCRIPTIONS: Record<string, string> = {
  [KeerisModule.PIPELINE_SCRAPE]: 'Vikerraadio/ERR episode discovery and track parsing pipeline workflow',
  [KeerisModule.PIPELINE_RESCRAPE]: 'ERR radio missing episodes discovery and re-scraping workflow',
  [KeerisModule.SINGLE_SCRAPE]: 'Single-step ERR radio episode scraping task workflow',
};

/**
 * Pre-compiled typed workflow AST definitions for Keeris.
 */
export const keerisScripts: Record<string, CuratorScriptDefinition> = Object.fromEntries(
  Object.entries(KEERIS_WORKFLOW_ASTS).map(([name, ast]) => [
    name,
    {
      name,
      description: SCRIPT_DESCRIPTIONS[name] || `Keeris AST workflow for ${name}`,
      ast,
      run: async () => {},
    },
  ])
);

export const keerisPlugin: CuratorPlugin = {
  name: 'miniapp:keeris',
  version: '2.0.0',
  description: 'Curator Keeris Radio & Music Archive Engine with Autonomous Discovery and Track Cataloging',
  roles: {
    [KeerisRole.ADMIN]: {
      name: KeerisRole.ADMIN,
      description: 'Keeris Archive Administrator with full catalog management, scraping, and crawler privileges',
      subRoles: [KeerisRole.CURATOR],
    },
    [KeerisRole.CURATOR]: {
      name: KeerisRole.CURATOR,
      description: 'Radio Curator authorized to trigger crawler agents and download broadcast audio',
      subRoles: [KeerisRole.VIEWER],
      tools: [
        KeerisTool.TRIGGER_AGENT,
        KeerisTool.DOWNLOAD_EPISODE,
        KeerisTool.DISCOVER_EPISODES,
        KeerisTool.PROCESS_EPISODE,
      ],
    },
    [KeerisRole.VIEWER]: {
      name: KeerisRole.VIEWER,
      description: 'Music catalog listener and spectator searching songs, episodes, and broadcast airings',
      tools: [
        KeerisTool.SEARCH_TRACKS,
        KeerisTool.GET_STATS,
        KeerisTool.GET_AGENTS,
      ],
    },
  },
  defaultUserRoles: [KeerisRole.CURATOR, KeerisRole.VIEWER],
  systemRoles: [
    CuratorSystemRole.ADMIN,
    KeerisRole.ADMIN,
    KeerisRole.CURATOR,
    KeerisRole.VIEWER,
  ],
  tools: KEERIS_WHITELISTED_TOOLS,
  scripts: keerisScripts,
  agents: Object.fromEntries(
    Object.entries(RADIO_PROGRAMS).map(([id, def]) => [
      id,
      {
        ast: buildPipelineScrapeAST(def),
        schedule: def.schedule,
        enabled: def.enabled,
      },
    ])
  ) as any,
};
