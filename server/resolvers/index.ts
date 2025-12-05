import { consult as consultService } from '../../src/service'
import { GraphQLError } from 'graphql'

export const resolvers = {
  Query: {
    me: (_: any, __: any, context: any) => {
      if (!context.user) {
        throw new GraphQLError('Not authenticated', {
          extensions: { code: 'UNAUTHENTICATED' }
        })
      }
      return context.user
    },

    consult: async (_: any, { query }: { query: string }, context: any) => {
      if (!context.user) {
        throw new GraphQLError('Not authenticated', {
          extensions: { code: 'UNAUTHENTICATED' }
        })
      }

      if (!query || !query.trim()) {
        throw new GraphQLError('Query parameter is required', {
          extensions: { code: 'BAD_REQUEST' }
        })
      }

      try {
        const results = await consultService(query)
        return results.map((result: any) => ({
          content: result.content || result.pageContent || result.text,
          score: result.score || 0,
          metadata: result.metadata || {}
        }))
      } catch (error) {
        console.error('Error in consult resolver:', error)
        throw new GraphQLError('Internal server error', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' }
        })
      }
    }
  },

  Mutation: {
    logout: (_: any, __: any, context: any) => {
      // Client should clear the JWT token
      return true
    }
  }
}
