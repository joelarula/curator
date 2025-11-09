import type { GraphQLResolveInfo } from "graphql";
import { UpdateOneChunkArgs } from "./args/UpdateOneChunkArgs";
import { Chunk } from "../../../models/Chunk";
export declare class UpdateOneChunkResolver {
    updateOneChunk(ctx: any, info: GraphQLResolveInfo, args: UpdateOneChunkArgs): Promise<Chunk | null>;
}
