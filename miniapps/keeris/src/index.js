// Keeris Mini-App Public Barrel Export

// Database & Normalization
export {
  openDatabase,
  normalizeText,
  makeFingerprint,
  ensureUniqueTrack,
  ensureProgram,
  backfillUniqueTracks,
} from './db.js';

// Scraper & Parsers
export { scrape, scrape as scrapeProgram } from './scrape.js';
export { parseMusicList, parseEpisodeText, parseEpisodeDate } from './episode-parser.js';
export { ErrClient } from './err-client.js';
export { discoverEpisodes, episodeDate } from './archive.js';

// GraphQL & Server APIs
export { executeGraphql, schema, resolvers } from './server/graphql.js';

// Curator Engine Runtime & Agent Bootstrap
export { startCuratorRuntime } from './curator-runtime.js';

// Domain Plugins & Registries
export { registerKeerisPlugins } from './plugins/index.js';
export { keerisDomainPlugin } from './plugins/keeris-domain.js';
export { createErrRadioPlugin } from './plugins/err-radio.js';
