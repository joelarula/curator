import { userResolvers } from '../modules/user/user.resolvers'
import { projectResolvers } from '../modules/project/project.resolvers'
import { consultantResolvers } from '../modules/consultant/consultant.resolvers'

export const resolvers = {
    Query: {
        ...userResolvers.Query,
        ...projectResolvers.Query,
        ...consultantResolvers.Query
    },
    Mutation: {
        ...userResolvers.Mutation,
        ...projectResolvers.Mutation,
        ...consultantResolvers.Mutation
    }
}
