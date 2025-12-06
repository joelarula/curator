import { GraphQLError } from 'graphql'

export const me = (_: any, __: any, context: any) => {
  if (!context.user) {
    throw new GraphQLError('Not authenticated', {
      extensions: { code: 'UNAUTHENTICATED' }
    })
  }
  return context.user
}
