/**
 * Shared base SDL — domain types common to both Node.js server and WASM/browser layer.
 */
export const baseTypeDefs: string = `# Shared domain model
type Program { id: ID!, seriesId: String!, title: String!, slug: String, description: String, url: String }

type EpisodeMetadata { id: ID!, description: String, fullText: String, summary: String, keywords: String }

type Episode {
  id: ID!
  url: String!
  title: String!
  scheduledAt: String
  publishedAt: String
  parseStatus: String!
  trackCount: Int!
  program: Program
  metadata: EpisodeMetadata
}

type UniqueTrack {
  id: ID!
  fingerprint: String!
  artist: String
  title: String
  playCount: Int!
  firstPlayedAt: String
  lastPlayedAt: String
  airings: [Track!]
  snippet: String
}

type Track {
  id: ID!
  position: Int!
  artist: String
  title: String
  rawText: String!
  date: String
  episodeId: ID
  programId: ID
  episodeTitle: String!
  episodeUrl: String!
  programTitle: String
  episodeDescription: String
  uniqueTrack: UniqueTrack
}

type ProgramStat {
  programId: ID!
  programTitle: String!
  episodes: Int!
  tracks: Int!
  uniqueTracks: Int!
}

type Stats {
  episodes: Int!
  tracks: Int!
  uniqueTracks: Int!
  programs: Int!
  programBreakdown: [ProgramStat!]
  noTracks: Int
  oldest: String
  newest: String
}

type CuratorAgent {
  id: ID!
  name: String!
  schedule: String
  isActive: Boolean
  ast: String
  enabled: Boolean
  episodesCount: Int
  tracksCount: Int
  lastRunAt: String
}

type CuratorResponse { id: ID!, requestId: ID!, content: String, createdAt: String, status: String }

type CuratorRequest {
  id: ID!
  scriptId: ID
  ast: String
  createdAt: String
  responses: [CuratorResponse!]!
  agentName: String
  status: String
}
`;
