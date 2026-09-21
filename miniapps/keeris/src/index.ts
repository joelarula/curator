// Keeris Mini-App Public Barrel Export

// Database & Normalization
export {
  openDatabase,
  normalizeText,
  makeFingerprint,
  ensureUniqueTrack,
  ensureProgram,
  ensureSchema,
  saveProgramData,
  saveEpisode,
} from './db.ts';

// Scraper & Parsers
export { scrape, scrape as scrapeProgram } from './scrape.ts';
export { parseMusicList, parseEpisodeText, parseEpisodeDate } from './episode-parser.ts';
export { ErrClient } from './err-client.ts';
export { discoverEpisodes, episodeDate } from './archive.ts';

// GraphQL & Server APIs
export { executeGraphql, schema, resolvers } from './server/graphql.ts';
export { typeDefs } from './graphql-typedefs.ts';

// Curator Engine Runtime & Agent Bootstrap
export { startCuratorRuntime } from './curator-runtime.ts';

// Domain Plugins & Registries
export { registerKeerisPlugins } from './plugins/index.ts';
export { keerisDomainPlugin } from './plugins/keeris-domain.ts';
export { createErrRadioPlugin, createProgramScrapeAST } from './plugins/err-radio.ts';
