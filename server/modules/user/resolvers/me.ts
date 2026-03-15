import { GraphQLError } from 'graphql'

export const me = (_: any, __: any, context: any) => {
    if (!context.user) {
        return null
    }
    return context.user
}
