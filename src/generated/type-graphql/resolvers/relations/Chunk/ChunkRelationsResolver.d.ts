import type { GraphQLResolveInfo } from "graphql";
import { Chunk } from "../../../models/Chunk";
import { FileData } from "../../../models/FileData";
import { Model } from "../../../models/Model";
export declare class ChunkRelationsResolver {
    file(chunk: Chunk, ctx: any, info: GraphQLResolveInfo): Promise<FileData>;
    model(chunk: Chunk, ctx: any, info: GraphQLResolveInfo): Promise<Model>;
}
