import { consult as consultService } from '../consultant.service'
import { GraphQLError } from 'graphql'

export const consult = async (_: any, { query, projectId }: { query: string, projectId?: number }, context: any) => {
    if (!context.user) {
        throw new GraphQLError('Not authenticated', {
            extensions: { code: 'UNAUTHENTICATED' }
        })
    }

    try {
        const results = await consultService(query, projectId)
        return results.map((result: any) => ({
            content: result.content || result.pageContent || result.text,
            score: result.score || 0,
            metadata: result.metadata || {}
        }))
    } catch (error) {
        console.error('Error in consult resolver:', error)
        throw new GraphQLError('Consultation failed', {
            extensions: { code: 'INTERNAL_SERVER_ERROR' }
        })
    }
}
