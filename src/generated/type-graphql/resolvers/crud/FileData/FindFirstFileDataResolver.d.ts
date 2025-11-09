import type { GraphQLResolveInfo } from "graphql";
import { FindFirstFileDataArgs } from "./args/FindFirstFileDataArgs";
import { FileData } from "../../../models/FileData";
export declare class FindFirstFileDataResolver {
    findFirstFileData(ctx: any, info: GraphQLResolveInfo, args: FindFirstFileDataArgs): Promise<FileData | null>;
}
