import type { GraphQLResolveInfo } from "graphql";
import { AggregateVectorStoreArgs } from "./args/AggregateVectorStoreArgs";
import { AggregateVectorStore } from "../../outputs/AggregateVectorStore";
export declare class AggregateVectorStoreResolver {
    aggregateVectorStore(ctx: any, info: GraphQLResolveInfo, args: AggregateVectorStoreArgs): Promise<AggregateVectorStore>;
}
