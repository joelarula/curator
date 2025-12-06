import { GraphQLError } from 'graphql'

export const ragAgent = async (_: any, { query }: { query: string }, context: any) => {
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
    const { ragAgent: ragAgentService } = await import('../../service')
    const result = await ragAgentService(query)
    return {
      answer: result.answer,
      sources: result.sources.map((source: any) => ({
        content: source.content || source.pageContent || source.text,
        score: source.score || 0,
        metadata: source.metadata || {}
      }))
    }
  } catch (error) {
    console.error('Error in ragAgent resolver:', error)
    throw new GraphQLError('Internal server error', {
      extensions: { code: 'INTERNAL_SERVER_ERROR' }
    })
  }
}
