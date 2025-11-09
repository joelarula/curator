import type { GraphQLResolveInfo } from "graphql";
import { FindUniqueChunkOrThrowArgs } from "./args/FindUniqueChunkOrThrowArgs";
import { Chunk } from "../../../models/Chunk";
export declare class FindUniqueChunkOrThrowResolver {
    getChunk(ctx: any, info: GraphQLResolveInfo, args: FindUniqueChunkOrThrowArgs): Promise<Chunk | null>;
}
