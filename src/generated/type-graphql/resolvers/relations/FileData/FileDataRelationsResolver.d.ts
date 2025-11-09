import type { GraphQLResolveInfo } from "graphql";
import { Chunk } from "../../../models/Chunk";
import { FileData } from "../../../models/FileData";
import { Project } from "../../../models/Project";
import { FileDataChunkArgs } from "./args/FileDataChunkArgs";
export declare class FileDataRelationsResolver {
    project(fileData: FileData, ctx: any, info: GraphQLResolveInfo): Promise<Project>;
    Chunk(fileData: FileData, ctx: any, info: GraphQLResolveInfo, args: FileDataChunkArgs): Promise<Chunk[]>;
}
