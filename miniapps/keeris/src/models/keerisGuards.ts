/**
 * Runtime Type Guards and Sanitizers for Keeris Domain Data.
 */
import type {
  TrackSearchInput,
  CatalogStatsInput,
  TriggerAgentInput,
  DownloadEpisodeInput,
} from './keerisShapes.ts';

export function isTrackSearchInput(val: unknown): val is TrackSearchInput {
  return typeof val === 'object' && val !== null;
}

export function isCatalogStatsInput(val: unknown): val is CatalogStatsInput {
  return typeof val === 'object' && val !== null;
}

export function isTriggerAgentInput(val: unknown): val is TriggerAgentInput {
  return (
    typeof val === 'object' &&
    val !== null &&
    typeof (val as TriggerAgentInput).name === 'string' &&
    (val as TriggerAgentInput).name.trim().length > 0
  );
}

export function isDownloadEpisodeInput(val: unknown): val is DownloadEpisodeInput {
  return (
    typeof val === 'object' &&
    val !== null &&
    typeof (val as DownloadEpisodeInput).url === 'string' &&
    (val as DownloadEpisodeInput).url.trim().length > 0
  );
}

