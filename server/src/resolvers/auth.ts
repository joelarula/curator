// Resolvers for auth.prisma models: User, Session, Role, etc.

export const authResolvers = {
    Query: {
        me: (_parent: any, _args: any, context: any) => {
            return context.user;
        },
    },
    Mutation: {},
};
