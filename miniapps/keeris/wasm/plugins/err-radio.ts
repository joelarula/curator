import { scrapeProgram } from '../err-scraper';
import type { WasmPlugin } from '../types';

/**
 * ERR Radio WASM Plugin
 * Provides browser-side scraping tools powered by in-worker Cheerio and OPFS SQLite.
 */
export const errRadioWasmPlugin: WasmPlugin = {
  name: 'err-radio',
  tools: {
    /**
     * vikerraadio_scrape: Full scrape pipeline for any ERR series.
     */
    async vikerraadio_scrape({ args, db, onProgress, isPaused, checkPause }) {
      if (!db) throw new Error('Database not initialized in WASM tool: vikerraadio_scrape');
      const seriesContentId = args?.seriesContentId ?? '1037846';
      const programTitle = args?.programTitle ?? 'Unknown Program';
      const refresh = args?.refresh === true;
      return await scrapeProgram(db, {
        seriesContentId,
        programTitle,
        refresh,
        onProgress,
        isPaused,
        checkPause,
      });
    },

    /**
     * keeris_scrape: Convenience wrapper for Kauamängiv.
     */
    async keeris_scrape({ args, db, onProgress, isPaused, checkPause }) {
      if (!db) throw new Error('Database not initialized in WASM tool: keeris_scrape');
      return await scrapeProgram(db, {
        seriesContentId: '1037846',
        programTitle: 'Kauamängiv',
        refresh: args?.refresh === true,
        onProgress,
        isPaused,
        checkPause,
      });
    },
  },
};
