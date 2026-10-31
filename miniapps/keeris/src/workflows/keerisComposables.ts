/**
 * Typed workflow AST composables for Keeris Radio scraper workflows.
 * Pure AST generators conforming to Curator AST v2 specification.
 */
import type { CuratorToolNode, CuratorForEachNode, CuratorSequentialNode } from '@curator/agent-server';
import { KeerisTool } from '../models/keerisContracts.ts';

/**
 * Step discovering radio episodes from ERR archive API.
 */
export function discoverEpisodesStep(
  seriesContentId: string | number,
  limit: number = 50,
  asKey: string = 'discovery'
): CuratorToolNode {
  return {
    type: 'Curator_Tool',
    toolName: KeerisTool.DISCOVER_EPISODES,
    as: asKey,
    args: { seriesContentId: String(seriesContentId), limit },
  };
}

/**
 * Step discovering episodes with missing tracks.
 */
export function discoverMissingEpisodesStep(
  limit: number = 50,
  programId?: string | number,
  asKey: string = 'discovery'
): CuratorToolNode {
  return {
    type: 'Curator_Tool',
    toolName: KeerisTool.DISCOVER_MISSING,
    as: asKey,
    args: { limit, programId },
  };
}

/**
 * Step processing a single radio episode in fault isolation.
 */
export function processEpisodeStep(options: {
  url: string;
  episodeExpr: string;
  seriesId: string;
  programTitle: string;
  refresh?: boolean;
}): CuratorToolNode {
  return {
    type: 'Curator_Tool',
    toolName: KeerisTool.PROCESS_EPISODE,
    args: {
      url: options.url,
      episode: options.episodeExpr,
      program: { seriesId: options.seriesId, title: options.programTitle },
      ...(options.refresh ? { refresh: true } : {}),
    },
  };
}

/**
 * Step executing a single scrape task directly.
 */
export function scrapeSingleStep(
  seriesContentId: string | number,
  programTitle: string
): CuratorToolNode {
  return {
    type: 'Curator_Tool',
    toolName: KeerisTool.SCRAPE_SERIES,
    args: { seriesContentId: String(seriesContentId), programTitle },
  };
}

/**
 * ForEach iteration block over discovered episodes.
 */
export function forEachEpisode(
  collectionExpr: string,
  body: CuratorToolNode | CuratorSequentialNode
): CuratorForEachNode {
  return {
    type: 'Curator_ForEach',
    collectionExpression: collectionExpr,
    iteratorName: 'episode',
    body,
  };
}

