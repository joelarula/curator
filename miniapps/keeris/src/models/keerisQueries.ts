/**
 * Canonical Keeris GraphQL queries and mutations used across tools, client adapter, and Vue frontend.
 */

export const GQL_UNIQUE_TRACKS = `
  query GetUniqueTracks($search: String, $programIds: [ID], $limit: Int) {
    uniqueTracks(search: $search, programIds: $programIds, limit: $limit) {
      id
      artist
      title
      playCount
      firstPlayedAt
      lastPlayedAt
      airings {
        date
        programTitle
        episodeTitle
        episodeUrl
      }
    }
  }
`;

export const GQL_STATS = `
  query GetStats($search: String, $programIds: [ID]) {
    stats(search: $search, programIds: $programIds) {
      episodes
      tracks
      uniqueTracks
      programs
      programBreakdown {
        programId
        programTitle
        episodes
        tracks
        uniqueTracks
      }
    }
  }
`;

export const GQL_AGENTS_OVERVIEW = `
  query GetAgentsOverview {
    curatorAgents {
      id
      name
      schedule
      enabled
      isActive
      episodesCount
      tracksCount
    }
  }
`;

export const GQL_TRIGGER_AGENT = `
  mutation TriggerAgent($name: String!, $refresh: Boolean) {
    triggerCuratorAgent(name: $name, refresh: $refresh) {
      id
      content
      createdAt
    }
  }
`;

