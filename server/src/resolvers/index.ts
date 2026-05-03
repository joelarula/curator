/**
 * resolvers/index.ts
 *
 * Merges all resolver modules into a single resolver map for Apollo Server.
 */
import { authResolvers } from './auth.js';
import { resourceResolvers } from './resources.js';
import { textResolvers } from './texts.js';
import { relationResolvers } from './relations.js';
import { agenticResolvers } from './agentic.js';
import { lookupResolvers } from './lookup.js';

import GraphQLJSON from 'graphql-type-json';

export const resolvers = {
    JSON: GraphQLJSON,
    // Spread field resolvers from each module
    ...resourceResolvers,
    ...textResolvers,
    ...relationResolvers,
    ...agenticResolvers,

    Query: {
        ...authResolvers.Query,
        ...resourceResolvers.Query,
        ...textResolvers.Query,
        ...relationResolvers.Query,
        ...agenticResolvers.Query,
        ...lookupResolvers.Query,
    },
    Mutation: {
        ...authResolvers.Mutation,
        ...resourceResolvers.Mutation,
        ...textResolvers.Mutation,
        ...relationResolvers.Mutation,
        ...agenticResolvers.Mutation,
        ...lookupResolvers.Mutation,
    },
};
