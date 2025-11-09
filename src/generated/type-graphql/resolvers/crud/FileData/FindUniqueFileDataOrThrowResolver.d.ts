import type { GraphQLResolveInfo } from "graphql";
import { FindUniqueFileDataOrThrowArgs } from "./args/FindUniqueFileDataOrThrowArgs";
import { FileData } from "../../../models/FileData";
export declare class FindUniqueFileDataOrThrowResolver {
    findUniqueFileDataOrThrow(ctx: any, info: GraphQLResolveInfo, args: FindUniqueFileDataOrThrowArgs): Promise<FileData | null>;
}
