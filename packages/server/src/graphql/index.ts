import { buildSchema, graphql, type GraphQLSchema } from 'graphql';
import type { CuratorHost } from '@curator/host';
import { curatorGraphQLTypeDefs } from './schema.js';
import { createCuratorResolvers } from './resolvers.js';

export { curatorGraphQLTypeDefs } from './schema.js';
export { createCuratorResolvers } from './resolvers.js';

export const curatorGraphQLSchema: GraphQLSchema = buildSchema(curatorGraphQLTypeDefs);

export async function executeCuratorGraphql(
  host: CuratorHost,
  query: string,
  variables?: any,
  schema: GraphQLSchema = curatorGraphQLSchema,
  customResolvers: Record<string, any> = {}
) {
  const rootValue = createCuratorResolvers(host, customResolvers);
  return graphql({
    schema,
    source: query,
    variableValues: variables,
    rootValue,
  });
}
