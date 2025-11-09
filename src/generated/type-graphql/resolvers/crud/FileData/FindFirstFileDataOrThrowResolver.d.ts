import type { GraphQLResolveInfo } from "graphql";
import { FindFirstFileDataOrThrowArgs } from "./args/FindFirstFileDataOrThrowArgs";
import { FileData } from "../../../models/FileData";
export declare class FindFirstFileDataOrThrowResolver {
    findFirstFileDataOrThrow(ctx: any, info: GraphQLResolveInfo, args: FindFirstFileDataOrThrowArgs): Promise<FileData | null>;
}
