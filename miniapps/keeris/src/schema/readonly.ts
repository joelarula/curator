import { baseTypeDefs } from './base.ts';

const readonlyQueryTypeDefs = `
type Query {
  programs: [Program!]!
  program(id: ID!): Program
  tracks(search: String, programId: ID, episodeId: ID, limit: Int, offset: Int): [Track!]!
  uniqueTracks(search: String, programIds: [ID], limit: Int, offset: Int): [UniqueTrack!]!
  episodes(search: String, programId: ID, limit: Int, offset: Int): [Episode!]!
  episode(id: ID!): Episode
  stats(search: String, programIds: [ID]): Stats!
}
`;

/**
 * GraphQL SDL for read-only deployments without Curator engine or Auth.
 */
export const readonlyTypeDefs: string = baseTypeDefs + '\n' + readonlyQueryTypeDefs;
