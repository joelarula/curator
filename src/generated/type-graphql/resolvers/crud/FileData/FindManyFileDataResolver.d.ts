import type { GraphQLResolveInfo } from "graphql";
import { FindManyFileDataArgs } from "./args/FindManyFileDataArgs";
import { FileData } from "../../../models/FileData";
export declare class FindManyFileDataResolver {
    findManyFileData(ctx: any, info: GraphQLResolveInfo, args: FindManyFileDataArgs): Promise<FileData[]>;
}
