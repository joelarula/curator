import { RADIO_PROGRAMS, buildPipelineScrapeAST, type CreateProgramScrapeASTOptions } from './manifest.ts';
import {
  keerisSearchTracksTool,
  keerisGetStatsTool,
  keerisGetAgentsTool,
  keerisTriggerAgentTool,
  keerisDownloadEpisodeTool,
} from './keerisTools.ts';

export interface KeerisAgentDefinition {
  ast: ReturnType<typeof buildPipelineScrapeAST>;
  schedule: string;
  enabled: boolean;
}

export interface KeerisDomainPlugin {
  name: string;
  scripts?: Record<string, any>;
  tools?: Record<string, any>;
  agents: Record<string, KeerisAgentDefinition>;
}

export const keerisDomainPlugin: KeerisDomainPlugin = {
  name: 'keeris-domain',
  tools: {
    keeris_search_tracks: keerisSearchTracksTool,
    keeris_get_stats: keerisGetStatsTool,
    keeris_get_agents: keerisGetAgentsTool,
    keeris_trigger_agent: keerisTriggerAgentTool,
    vikerraadio_download_episode: keerisDownloadEpisodeTool,
  },
  agents: Object.fromEntries(
    Object.entries(RADIO_PROGRAMS).map(([id, def]) => [
      id,
      {
        ast: buildPipelineScrapeAST(def),
        schedule: def.schedule,
        enabled: def.enabled,
      },
    ])
  ),
};
