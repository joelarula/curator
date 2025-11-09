import type { GraphQLResolveInfo } from "graphql";
import { DeleteOneChunkArgs } from "./args/DeleteOneChunkArgs";
import { Chunk } from "../../../models/Chunk";
export declare class DeleteOneChunkResolver {
    deleteOneChunk(ctx: any, info: GraphQLResolveInfo, args: DeleteOneChunkArgs): Promise<Chunk | null>;
}
