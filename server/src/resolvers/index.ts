import { authResolvers } from './auth.js';
import { coreResolvers } from './core.js';
import { analysisResolvers } from './analysis.js';
import { feedsResolver } from './feeds.js';

// Merge all resolver modules into a single resolver map
export const resolvers = {
    ...coreResolvers,
    ...authResolvers,
    ...analysisResolvers,
    ...feedsResolver,
    Query: {
        ...authResolvers.Query,
        ...coreResolvers.Query,
        ...analysisResolvers.Query,
        ...feedsResolver.Query,
    },
    Mutation: {
        ...authResolvers.Mutation,
        ...coreResolvers.Mutation,
        ...analysisResolvers.Mutation,
        ...feedsResolver.Mutation,
    },
};
