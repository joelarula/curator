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

type Role {
  id: ID!
  name: String!
  description: String
}

type User {
  id: ID!
  email: String!
  name: String
  googleId: String
  roles: [Role!]!
  createdAt: String
  updatedAt: String
}

# Authorization guard directives (enforced by @curator/plugin-auth)
directive @auth(role: String, roles: [String!]) on FIELD_DEFINITION
directive @requireRole(role: String!) on FIELD_DEFINITION

type Query {
  me: User
  programs: [Program!]!
  program(id: ID!): Program
  tracks(search: String, programId: ID, episodeId: ID, limit: Int, offset: Int): [Track!]!
  uniqueTracks(search: String, programIds: [ID], limit: Int, offset: Int): [UniqueTrack!]!
  episodes(search: String, programId: ID, limit: Int, offset: Int): [Episode!]!
  episode(id: ID!): Episode
  stats(search: String, programIds: [ID]): Stats!
  curatorDatabaseHealth: CuratorDatabaseHealth! @requireRole(role: "curator_manager")
  curatorAgents: [CuratorAgent!]! @requireRole(role: "curator_manager")
  curatorRequests(limit: Int): [CuratorRequest!]! @requireRole(role: "curator_manager")
}

type Mutation {
  triggerAgent(id: ID, name: String, agentName: String, refresh: Boolean): CuratorResponse! @requireRole(role: "curator_manager")
  triggerCuratorAgent(name: String, agentName: String, refresh: Boolean): CuratorResponse! @requireRole(role: "curator_manager")
  toggleAgent(id: ID!, enabled: Boolean, isActive: Boolean): CuratorAgent! @requireRole(role: "curator_manager")
  toggleCuratorAgent(id: ID!, isActive: Boolean!): CuratorAgent! @requireRole(role: "curator_manager")
  updateAgentSchedule(id: ID!, schedule: String!): CuratorAgent! @requireRole(role: "curator_manager")
  scrapeProgram(seriesContentId: String!, programTitle: String!, refresh: Boolean): ScrapeResult! @requireRole(role: "curator_manager")
  updateEpisodeMetadata(episodeId: ID, url: String, description: String, fullText: String): EpisodeMetadata! @requireRole(role: "curator_manager")
  downloadEpisode(url: String!, fileName: String): EpisodeDownloadResult! @requireRole(role: "curator_manager")
  deleteAgent(id: ID!): Boolean! @requireRole(role: "curator_manager")
}
`;

/**
 * Full SDL for the Node.js server layer.
 * Composed from baseTypeDefs + server-only operations.
 */
export const serverTypeDefs: string = baseTypeDefs + '\n' + serverOnlyTypeDefs;
