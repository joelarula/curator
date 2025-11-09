import type { GraphQLResolveInfo } from "graphql";
import { GroupByVectorStoreArgs } from "./args/GroupByVectorStoreArgs";
import { VectorStoreGroupBy } from "../../outputs/VectorStoreGroupBy";
export declare class GroupByVectorStoreResolver {
    groupByVectorStore(ctx: any, info: GraphQLResolveInfo, args: GroupByVectorStoreArgs): Promise<VectorStoreGroupBy[]>;
}
