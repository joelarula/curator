import { buildSchema, graphql, type GraphQLSchema } from 'graphql';
import type { CuratorHost } from '@curator/host';
import { curatorGraphQLTypeDefs } from './schema.js';
import { createCuratorResolvers, type CuratorResolverOptions } from './resolvers.js';

export { curatorGraphQLTypeDefs } from './schema.js';
export { createCuratorResolvers, type CuratorResolverOptions } from './resolvers.js';

export const curatorGraphQLSchema: GraphQLSchema = buildSchema(curatorGraphQLTypeDefs);

export async function executeCuratorGraphql(
  host: CuratorHost,
  query: string,
  variables?: any,
  schema: GraphQLSchema = curatorGraphQLSchema,
  customResolvers: Record<string, any> = {},
  options: CuratorResolverOptions = {}
) {
  const rootValue = createCuratorResolvers(host, customResolvers, options);
  return graphql({
    schema,
    source: query,
    variableValues: variables,
    rootValue,
  });
}
