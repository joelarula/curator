import { getProjects } from '../projects'
import { GraphQLError } from 'graphql'

export const projects = async (_: any, __: any, context: any) => {
    if (!context.user) {
        throw new GraphQLError('Not authenticated', {
            extensions: { code: 'UNAUTHENTICATED' }
        })
    }

    // Use accountId from user context if available, or default to 1
    const accountId = context.user.accountId || 1
    return getProjects(accountId)
}
