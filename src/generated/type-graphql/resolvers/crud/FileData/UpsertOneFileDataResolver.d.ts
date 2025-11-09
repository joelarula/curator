import type { GraphQLResolveInfo } from "graphql";
import { UpsertOneFileDataArgs } from "./args/UpsertOneFileDataArgs";
import { FileData } from "../../../models/FileData";
export declare class UpsertOneFileDataResolver {
    upsertOneFileData(ctx: any, info: GraphQLResolveInfo, args: UpsertOneFileDataArgs): Promise<FileData>;
}
