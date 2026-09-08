export const typeDefs = `
  type Program { id: ID!, seriesId: String!, title: String!, slug: String, description: String, url: String }
  type EpisodeMetadata { id: ID!, description: String, fullText: String, summary: String, keywords: String }
  type Episode {
    id: ID!,
    url: String!,
    title: String!,
    scheduledAt: String,
    publishedAt: String,
    parseStatus: String!,
    trackCount: Int!,
    program: Program,
    metadata: EpisodeMetadata
  }
  type UniqueTrack {
    id: ID!,
    fingerprint: String!,
    artist: String,
    title: String,
    playCount: Int!,
    firstPlayedAt: String,
    lastPlayedAt: String,
    airings: [Track!]
  }
  type Track {
    id: ID!,
    position: Int!,
    artist: String,
    title: String,
    rawText: String!,
    date: String,
    episodeTitle: String!,
    episodeUrl: String!,
    programTitle: String,
    episodeDescription: String,
    uniqueTrack: UniqueTrack
  }
  type ProgramStat {
    programId: ID!,
    programTitle: String!,
    episodes: Int!,
    tracks: Int!,
    uniqueTracks: Int!
  }
  type Stats {
    episodes: Int!,
    tracks: Int!,
    uniqueTracks: Int!,
    programs: Int!,
    programBreakdown: [ProgramStat!]
  }
  type CuratorAgent { 
    id: ID!, 
    name: String!, 
    schedule: String, 
    isActive: Boolean,
    episodesCount: Int,
    tracksCount: Int,
    lastRunAt: String
  }
  type CuratorResponse { id: ID!, requestId: ID!, content: String, createdAt: String }
  type CuratorRequest { id: ID!, scriptId: ID, ast: String, status: String, createdAt: String, responses: [CuratorResponse!]! }

  type PlaylistItem {
    id: ID!
    playlistId: ID!
    position: Int!
    notes: String
    createdAt: String
    uniqueTrack: UniqueTrack
    track: Track
    episode: Episode
  }

  type Playlist {
    id: ID!
    title: String!
    description: String
    createdAt: String
    itemCount: Int!
    items: [PlaylistItem!]!
  }

  type Query {
    programs: [Program!]!,
    tracks(search: String, programId: ID, limit: Int, offset: Int): [Track!]!,
    uniqueTracks(search: String, programIds: [ID], limit: Int, offset: Int): [UniqueTrack!]!,
    episodes(search: String, limit: Int): [Episode!]!,
    stats: Stats!,
    curatorAgents: [CuratorAgent!]!,
    curatorRequests(limit: Int): [CuratorRequest!]!,
    playlists: [Playlist!]!,
    playlist(id: ID!): Playlist
  }

  type Mutation {
    createPlaylist(title: String!, description: String): Playlist!
    addPlaylistItem(playlistId: ID!, trackId: ID, uniqueTrackId: ID, notes: String): PlaylistItem!
    triggerCuratorAgent(agentName: String!): CuratorRequest!
    toggleCuratorAgent(id: ID!, isActive: Boolean!): CuratorAgent!
  }
`;
