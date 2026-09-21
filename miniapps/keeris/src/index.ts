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
export { serverTypeDefs } from './schema/server.ts';
// Note: wasmTypeDefs is exported from ./schema/wasm.ts but uses Vite ?raw imports —
// consume it directly in Vite-bundled contexts (wasm/ workers, web/).

// Curator Engine Runtime & Agent Bootstrap
export { startCuratorRuntime } from './curator-runtime.ts';

// Domain Plugins & Registries
export { registerKeerisPlugins } from './plugins/index.ts';
export { keerisDomainPlugin } from './plugins/keeris-domain.ts';
export { createErrRadioPlugin, createProgramScrapeAST } from './plugins/err-radio.ts';
export {
  RADIO_PROGRAMS,
  buildSingleScrapeAST,
  buildPipelineScrapeAST,
  buildAgentAst,
  type RadioProgramDefinition,
  type CreateProgramScrapeASTOptions,
} from './plugins/manifest.ts';
