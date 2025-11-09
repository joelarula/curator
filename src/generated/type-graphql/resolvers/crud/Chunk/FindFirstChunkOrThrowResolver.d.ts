import type { GraphQLResolveInfo } from "graphql";
import { FindFirstChunkOrThrowArgs } from "./args/FindFirstChunkOrThrowArgs";
import { Chunk } from "../../../models/Chunk";
export declare class FindFirstChunkOrThrowResolver {
    findFirstChunkOrThrow(ctx: any, info: GraphQLResolveInfo, args: FindFirstChunkOrThrowArgs): Promise<Chunk | null>;
}
