import { ErrClient } from './err-client.js';
import { openDatabase } from './db.js';
import { scrape } from './scrape.js';

export function startIndexer({ databasePath, intervalMs = 21_600_000, logger = console } = {}) {
  const db = openDatabase(databasePath);
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const result = await scrape({ client: new ErrClient(), db, logger, refresh: false });
      logger.log(`[Keeris] Index run complete: ${result.episodesParsed} parsed, ${result.tracksSaved} tracks, ${result.failures} failures`);
    } catch (error) {
      logger.error(`[Keeris] Index run failed: ${error.message}`);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(run, intervalMs);
  return { db, run, stop: () => { clearInterval(timer); db.close(); } };
}