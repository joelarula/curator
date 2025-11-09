import type { GraphQLResolveInfo } from "graphql";
import { FindManyChunkArgs } from "./args/FindManyChunkArgs";
import { Chunk } from "../../../models/Chunk";
export declare class FindManyChunkResolver {
    chunks(ctx: any, info: GraphQLResolveInfo, args: FindManyChunkArgs): Promise<Chunk[]>;
}
