import type { GraphQLResolveInfo } from "graphql";
import { UpdateOneFileDataArgs } from "./args/UpdateOneFileDataArgs";
import { FileData } from "../../../models/FileData";
export declare class UpdateOneFileDataResolver {
    updateOneFileData(ctx: any, info: GraphQLResolveInfo, args: UpdateOneFileDataArgs): Promise<FileData | null>;
}
