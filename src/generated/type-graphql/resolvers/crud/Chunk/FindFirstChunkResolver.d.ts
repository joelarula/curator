import type { GraphQLResolveInfo } from "graphql";
import { FindFirstChunkArgs } from "./args/FindFirstChunkArgs";
import { Chunk } from "../../../models/Chunk";
export declare class FindFirstChunkResolver {
    findFirstChunk(ctx: any, info: GraphQLResolveInfo, args: FindFirstChunkArgs): Promise<Chunk | null>;
}
