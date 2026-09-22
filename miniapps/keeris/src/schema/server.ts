import { baseTypeDefs } from './base.ts';

const serverOnlyTypeDefs = `
type ScrapeResult { seriesContentId: String!, programTitle: String!, episodesSeen: Int!, episodesParsed: Int!, tracksSaved: Int!, failures: Int! }

type EpisodeDownloadResult { downloaded: Boolean!, episodeUrl: String!, audioUrl: String!, filePath: String!, fileName: String!, fileSizeMB: String }

type CuratorTableInfo {
  name: String!
  rowCount: Int!
}

type CuratorDatabaseHealth {
  storageEngine: String
  isOpfs: Boolean
  tables: [CuratorTableInfo!]!
  requestsTotal: Int
  requestsCompleted: Int
  requestsFailed: Int
  requestsPending: Int
  agentsTotal: Int
  agentsActive: Int
}

type Query {
  programs: [Program!]!
  program(id: ID!): Program
  tracks(search: String, programId: ID, episodeId: ID, limit: Int, offset: Int): [Track!]!
  uniqueTracks(search: String, programIds: [ID], limit: Int, offset: Int): [UniqueTrack!]!
  episodes(search: String, programId: ID, limit: Int, offset: Int): [Episode!]!
  episode(id: ID!): Episode
  stats(search: String, programIds: [ID]): Stats!
  curatorDatabaseHealth: CuratorDatabaseHealth!
  curatorAgents: [CuratorAgent!]!
  curatorRequests(limit: Int): [CuratorRequest!]!
}

type Mutation {
  triggerCuratorAgent(name: String, agentName: String, refresh: Boolean): CuratorResponse!
  toggleCuratorAgent(id: ID!, isActive: Boolean!): CuratorAgent!
  scrapeProgram(seriesContentId: String!, programTitle: String!, refresh: Boolean): ScrapeResult!
  updateEpisodeMetadata(episodeId: ID, url: String, description: String, fullText: String): EpisodeMetadata!
  downloadEpisode(url: String!, fileName: String): EpisodeDownloadResult!
}
`;

/**
 * Full SDL for the Node.js server layer.
 * Composed from baseTypeDefs + server-only operations.
 */
export const serverTypeDefs: string = baseTypeDefs + '\n' + serverOnlyTypeDefs;
