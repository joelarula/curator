import { me } from './resolvers/me'
import { logout } from './resolvers/logout'

export const userResolvers = {
    Query: {
        me
    },
    Mutation: {
        logout
    }
}
