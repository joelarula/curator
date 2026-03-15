import { consult } from './resolvers/consult'
import { ragAgent } from './resolvers/ragAgent'

export const consultantResolvers = {
    Query: {
        consult,
        ragAgent
    },
    Mutation: {}
}
