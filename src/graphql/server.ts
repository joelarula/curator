import 'reflect-metadata';
import { ApolloServer } from 'apollo-server';
import { buildSchema } from 'type-graphql';
import { PrismaClient } from '@prisma/client';
import { resolvers } from '../generated/type-graphql';

const prisma = new PrismaClient();

async function bootstrap() {
  // Build TypeGraphQL schema
  const schema = await buildSchema({
    resolvers,
    validate: false,
  });

  // Create Apollo Server
  const server = new ApolloServer({
    schema,
    context: () => ({ prisma }),
  });

  // Start the server
  const { url } = await server.listen(4000);
  console.log(`🚀 Server ready at ${url}`);
}

bootstrap().catch(console.error);