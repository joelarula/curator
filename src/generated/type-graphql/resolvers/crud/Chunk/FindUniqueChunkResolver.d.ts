import type { GraphQLResolveInfo } from "graphql";
import { FindUniqueChunkArgs } from "./args/FindUniqueChunkArgs";
import { Chunk } from "../../../models/Chunk";
export declare class FindUniqueChunkResolver {
    chunk(ctx: any, info: GraphQLResolveInfo, args: FindUniqueChunkArgs): Promise<Chunk | null>;
}
