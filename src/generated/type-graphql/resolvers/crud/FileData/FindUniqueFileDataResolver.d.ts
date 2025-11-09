import type { GraphQLResolveInfo } from "graphql";
import { FindUniqueFileDataArgs } from "./args/FindUniqueFileDataArgs";
import { FileData } from "../../../models/FileData";
export declare class FindUniqueFileDataResolver {
    findUniqueFileData(ctx: any, info: GraphQLResolveInfo, args: FindUniqueFileDataArgs): Promise<FileData | null>;
}
