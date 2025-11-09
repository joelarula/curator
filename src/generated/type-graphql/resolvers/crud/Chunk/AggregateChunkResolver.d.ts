import type { GraphQLResolveInfo } from "graphql";
import { AggregateChunkArgs } from "./args/AggregateChunkArgs";
import { AggregateChunk } from "../../outputs/AggregateChunk";
export declare class AggregateChunkResolver {
    aggregateChunk(ctx: any, info: GraphQLResolveInfo, args: AggregateChunkArgs): Promise<AggregateChunk>;
}
