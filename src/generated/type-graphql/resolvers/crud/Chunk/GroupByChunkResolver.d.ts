import type { GraphQLResolveInfo } from "graphql";
import { GroupByChunkArgs } from "./args/GroupByChunkArgs";
import { ChunkGroupBy } from "../../outputs/ChunkGroupBy";
export declare class GroupByChunkResolver {
    groupByChunk(ctx: any, info: GraphQLResolveInfo, args: GroupByChunkArgs): Promise<ChunkGroupBy[]>;
}
