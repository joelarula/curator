import type { GraphQLResolveInfo } from "graphql";
import { AggregateChunkArgs } from "./args/AggregateChunkArgs";
import { DeleteManyChunkArgs } from "./args/DeleteManyChunkArgs";
import { DeleteOneChunkArgs } from "./args/DeleteOneChunkArgs";
import { FindFirstChunkArgs } from "./args/FindFirstChunkArgs";
import { FindFirstChunkOrThrowArgs } from "./args/FindFirstChunkOrThrowArgs";
import { FindManyChunkArgs } from "./args/FindManyChunkArgs";
import { FindUniqueChunkArgs } from "./args/FindUniqueChunkArgs";
import { FindUniqueChunkOrThrowArgs } from "./args/FindUniqueChunkOrThrowArgs";
import { GroupByChunkArgs } from "./args/GroupByChunkArgs";
import { UpdateManyChunkArgs } from "./args/UpdateManyChunkArgs";
import { UpdateOneChunkArgs } from "./args/UpdateOneChunkArgs";
import { Chunk } from "../../../models/Chunk";
import { AffectedRowsOutput } from "../../outputs/AffectedRowsOutput";
import { AggregateChunk } from "../../outputs/AggregateChunk";
import { ChunkGroupBy } from "../../outputs/ChunkGroupBy";
export declare class ChunkCrudResolver {
    aggregateChunk(ctx: any, info: GraphQLResolveInfo, args: AggregateChunkArgs): Promise<AggregateChunk>;
    deleteManyChunk(ctx: any, info: GraphQLResolveInfo, args: DeleteManyChunkArgs): Promise<AffectedRowsOutput>;
    deleteOneChunk(ctx: any, info: GraphQLResolveInfo, args: DeleteOneChunkArgs): Promise<Chunk | null>;
    findFirstChunk(ctx: any, info: GraphQLResolveInfo, args: FindFirstChunkArgs): Promise<Chunk | null>;
    findFirstChunkOrThrow(ctx: any, info: GraphQLResolveInfo, args: FindFirstChunkOrThrowArgs): Promise<Chunk | null>;
    chunks(ctx: any, info: GraphQLResolveInfo, args: FindManyChunkArgs): Promise<Chunk[]>;
    chunk(ctx: any, info: GraphQLResolveInfo, args: FindUniqueChunkArgs): Promise<Chunk | null>;
    getChunk(ctx: any, info: GraphQLResolveInfo, args: FindUniqueChunkOrThrowArgs): Promise<Chunk | null>;
    groupByChunk(ctx: any, info: GraphQLResolveInfo, args: GroupByChunkArgs): Promise<ChunkGroupBy[]>;
    updateManyChunk(ctx: any, info: GraphQLResolveInfo, args: UpdateManyChunkArgs): Promise<AffectedRowsOutput>;
    updateOneChunk(ctx: any, info: GraphQLResolveInfo, args: UpdateOneChunkArgs): Promise<Chunk | null>;
}
