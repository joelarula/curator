/**
 * Canonical Keeris Workflow AST Definitions.
 * Conforms to Curator AST v2 schema with pure deterministic structure.
 */
import type { CuratorSequentialNode } from '@curator/agent-server';
import {
  discoverEpisodesStep,
  discoverMissingEpisodesStep,
  processEpisodeStep,
  scrapeSingleStep,
  forEachEpisode,
} from './keerisComposables.ts';
import { KeerisModule } from '../models/keerisContracts.ts';

export interface ProgramPipelineOptions {
  seriesContentId: string | number;
  programTitle: string;
  limit?: number;
}

/**
 * Builds a multi-step pipeline AST (discover -> forEach process_episode).
 */
export function buildPipelineScrapeAST({
  seriesContentId,
  programTitle,
  limit = 50,
}: ProgramPipelineOptions): CuratorSequentialNode {
  if (String(seriesContentId) === 'missing') {
    return buildRescrapeMissingAST({ limit });
  }

  return {
    type: 'Curator_Sequential',
    name: `pipeline_scrape_${seriesContentId}`,
    subAgents: [
      discoverEpisodesStep(seriesContentId, limit, 'discovery'),
      forEachEpisode(
        '{{discovery.data}}',
        processEpisodeStep({
          url: '{{episode.url}}',
          episodeExpr: '{{episode}}',
          seriesId: String(seriesContentId),
          programTitle,
        })
      ),
    ],
  };
}

/**
 * Builds a pipeline AST discovering and re-scraping episodes currently missing tracks.
 */
export function buildRescrapeMissingAST(options: {
  limit?: number;
  programId?: number | string;
} = {}): CuratorSequentialNode {
  return {
    type: 'Curator_Sequential',
    name: 'pipeline_rescrape_missing_episodes',
    subAgents: [
      discoverMissingEpisodesStep(options.limit ?? 50, options.programId, 'discovery'),
      forEachEpisode(
        '{{discovery.data}}',
        processEpisodeStep({
          url: '{{episode.url}}',
          episodeExpr: '{{episode}}',
          seriesId: '{{episode.seriesId}}',
          programTitle: '{{episode.programTitle}}',
          refresh: true,
        })
      ),
    ],
  };
}

/**
 * Builds a single-step tool task AST.
 */
export function buildSingleScrapeAST({
  seriesContentId,
  programTitle,
}: {
  seriesContentId: string | number;
  programTitle: string;
}): CuratorSequentialNode {
  return {
    type: 'Curator_Sequential',
    name: `seq_scrape_${seriesContentId}`,
    subAgents: [scrapeSingleStep(seriesContentId, programTitle)],
  };
}

/**
 * Canonical registry of core AST workflows in Keeris.
 */
export const KEERIS_WORKFLOW_ASTS: Record<string, CuratorSequentialNode> = {
  [KeerisModule.PIPELINE_SCRAPE]: buildPipelineScrapeAST({
    seriesContentId: '1037846',
    programTitle: 'Kauamängiv',
    limit: 50,
  }),
  [KeerisModule.PIPELINE_RESCRAPE]: buildRescrapeMissingAST({ limit: 50 }),
  [KeerisModule.SINGLE_SCRAPE]: buildSingleScrapeAST({
    seriesContentId: '1037846',
    programTitle: 'Kauamängiv',
  }),
};

