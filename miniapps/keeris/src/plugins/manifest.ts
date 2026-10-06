/**
 * src/plugins/manifest.ts
 *
 * Canonical shared definition of ERR Radio programs and their scraping schedules.
 * Pure data & pure AST generator functions with zero environment (Node/browser) dependencies.
 * Shared between the Node.js server and the WASM Web Worker.
 */

export interface RadioProgramDefinition {
  seriesContentId: string;
  programTitle: string;
  schedule: string;
  enabled: boolean;
}

/**
 * All curated radio programs across Vikerraadio and Klassikaraadio.
 */
export const RADIO_PROGRAMS: Record<string, RadioProgramDefinition> = {
  vikerraadio_kauamangiv_scrape: {
    seriesContentId: '1037846',
    programTitle: 'Kauamängiv',
    schedule: '0 14 * * 1-5', // Mon-Fri at 14:00 (after 12:15-14:00 broadcast)
    enabled: true,
  },
  vikerraadio_originaal_ja_koopia_scrape: {
    seriesContentId: '1037950',
    programTitle: 'Originaal ja koopia',
    schedule: '0 15 * * 6', // Saturdays at 15:00
    enabled: true,
  },
  vikerraadio_kantri_alati_jaab_scrape: {
    seriesContentId: '1037843',
    programTitle: 'Kantri alati jääb',
    schedule: '0 21 * * 6', // Saturdays at 21:00
    enabled: true,
  },
  vikerraadio_kuldrandevuu_scrape: {
    seriesContentId: '1037864',
    programTitle: 'Kuldrandevüü',
    schedule: '0 18 * * 0', // Sundays at 18:00
    enabled: true,
  },
  klassikaraadio_fantaasia_scrape: {
    seriesContentId: '1038126',
    programTitle: 'Fantaasia',
    schedule: '0 2 * * *', // Nightly at 02:00
    enabled: true,
  },
  klassikaraadio_kella_6_dzass_scrape: {
    seriesContentId: '1038156',
    programTitle: 'Kella-6-džäss',
    schedule: '0 19 * * 1-5', // Mon-Fri at 19:00 (after 18:00 broadcast)
    enabled: true,
  },
  klassikaraadio_lihtsalt_nostalgia_scrape: {
    seriesContentId: 'https://klassikaraadio.err.ee/1610109911/lihtsalt-nostalgia-kaisa-johvik',
    programTitle: 'Lihtsalt nostalgia',
    schedule: '0 16 * * 0', // Sundays at 16:00
    enabled: true,
  },
  vikerraadio_oomuusika_scrape: {
    seriesContentId: 'https://vikerraadio.err.ee/1610113264/oomuusika',
    programTitle: 'Öömuusika',
    schedule: '0 6 * * *', // Daily at 06:00 (after night broadcast)
    enabled: true,
  },
  klassikaraadio_helitrakk_scrape: {
    seriesContentId: 'https://klassikaraadio.err.ee/1610105843/helitrakk',
    programTitle: 'Heliträkk',
    schedule: '0 11 * * 6', // Saturdays at 11:00
    enabled: true,
  },
  klassikaraadio_folgialbum_scrape: {
    seriesContentId: '1038132',
    programTitle: 'Folgialbum',
    schedule: '0 11 * * 0', // Sundays at 11:00 (after 10:05 broadcast)
    enabled: true,
  },
  klassikaraadio_vanamuusikatund_scrape: {
    seriesContentId: '1038247',
    programTitle: 'Vanamuusikatund',
    schedule: '0 15 * * 6', // Saturdays at 15:00
    enabled: true,
  },
  klassikaraadio_tantsutund_scrape: {
    seriesContentId: '1038102',
    programTitle: 'Tantsutund',
    schedule: '0 14 * * 0', // Sundays at 14:00
    enabled: true,
  },
  klassikaraadio_serenaad_scrape: {
    seriesContentId: 'https://klassikaraadio.err.ee/1610135165/serenaad',
    programTitle: 'Serenaad',
    schedule: '0 18 * * 0', // Sundays at 18:00 (after 17:05 broadcast)
    enabled: true,
  },
  // Archived / Completed Series (on-demand triggerable via GraphQL)
  vikerraadio_heldur_karmo_aeg_scrape: {
    seriesContentId: '1610049724',
    programTitle: 'Heldur Karmo aeg',
    schedule: '0 0 1 1 *',
    enabled: false,
  },
  vikerraadio_muusika_noudlikule_maitsele_scrape: {
    seriesContentId: '1608635380',
    programTitle: 'Muusika nõudlikule maitsele',
    schedule: '0 0 1 1 *',
    enabled: false,
  },
  vikerraadio_jaak_joala_parimad_laulud_scrape: {
    seriesContentId: 'https://vikerraadio.err.ee/1609719716/jaak-joala-parimad-laulud',
    programTitle: 'Jaak Joala parimad laulud',
    schedule: '0 0 1 1 *',
    enabled: false,
  },
  vikerraadio_stuudios_on_jaan_elgula_scrape: {
    seriesContentId: 'https://vikerraadio.err.ee/817942/stuudios-on-jaan-elgula-2-tund/818433',
    programTitle: 'Stuudios on Jaan Elgula',
    schedule: '0 20 * * 5', // Fridays at 20:00 (after 18:00-20:00 broadcast)
    enabled: true,
  },
  vikerraadio_soovide_aeg_scrape: {
    seriesContentId: '1038019',
    programTitle: 'Soovide aeg',
    schedule: '0 17 * * 6', // Saturdays at 17:00 (after 15:05-17:00 broadcast)
    enabled: true,
  },
  err_rescrape_missing_episodes: {
    seriesContentId: 'missing',
    programTitle: 'Rescrape Missing Episodes',
    schedule: '0 4 * * *', // Daily at 04:00 AM
    enabled: true,
  },
};

import type { CuratorSequentialNode } from '@curator/agent-server';

/**
 * Single-step ToolTask AST using formal Curator AST syntax.
 */
export function buildSingleScrapeAST({ seriesContentId, programTitle }: { seriesContentId: string | number; programTitle: string }): CuratorSequentialNode {
  return {
    type: 'Curator_Sequential',
    name: `seq_scrape_${seriesContentId}`,
    subAgents: [
      {
        type: 'Curator_Tool',
        toolName: 'vikerraadio_scrape',
        args: { seriesContentId: String(seriesContentId), programTitle },
      },
    ],
  };
}

/** Alias matching wasm buildAgentAst */
export const buildAgentAst = buildSingleScrapeAST;

export interface CreateProgramScrapeASTOptions {
  seriesContentId: string | number;
  programTitle: string;
  limit?: number;
}

/**
 * Multi-step Pipeline AST using formal Curator AST syntax (discover -> forEach process_episode).
 */
export function buildPipelineScrapeAST({
  seriesContentId,
  programTitle,
  limit = 50,
}: CreateProgramScrapeASTOptions): CuratorSequentialNode {
  if (String(seriesContentId) === 'missing') {
    return buildRescrapeMissingAST({ limit });
  }

  return {
    type: 'Curator_Sequential',
    name: `pipeline_scrape_${seriesContentId}`,
    subAgents: [
      {
        type: 'Curator_Tool',
        toolName: 'vikerraadio_discover_episodes',
        args: { seriesContentId: String(seriesContentId), limit },
      },
      {
        type: 'Curator_ForEach',
        collectionExpression: '{{discovery.data}}',
        iteratorName: 'episode',
        body: {
          type: 'Curator_Tool',
          toolName: 'vikerraadio_process_episode',
          args: {
            url: '{{episode.url}}',
            episode: '{{episode}}',
            program: { seriesId: String(seriesContentId), title: programTitle },
          },
        },
      },
    ],
  };
}

/**
 * Pipeline AST for discovering and re-scraping episodes currently missing tracks.
 */
export function buildRescrapeMissingAST(options: { limit?: number; programId?: number | string } = {}): CuratorSequentialNode {
  return {
    type: 'Curator_Sequential',
    name: 'pipeline_rescrape_missing_episodes',
    subAgents: [
      {
        type: 'Curator_Tool',
        toolName: 'vikerraadio_discover_missing_episodes',
        args: { limit: options.limit ?? 50, programId: options.programId },
      },
      {
        type: 'Curator_ForEach',
        collectionExpression: '{{discovery.data}}',
        iteratorName: 'episode',
        body: {
          type: 'Curator_Tool',
          toolName: 'vikerraadio_process_episode',
          args: {
            url: '{{episode.url}}',
            episode: '{{episode}}',
            program: { seriesId: '{{episode.seriesId}}', title: '{{episode.programTitle}}' },
            refresh: true,
          },
        },
      },
    ],
  };
}

/** Alias matching server createProgramScrapeAST */
export const createProgramScrapeAST = buildPipelineScrapeAST;
