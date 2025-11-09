import type { GraphQLResolveInfo } from "graphql";
import { DeleteOneFileDataArgs } from "./args/DeleteOneFileDataArgs";
import { FileData } from "../../../models/FileData";
export declare class DeleteOneFileDataResolver {
    deleteOneFileData(ctx: any, info: GraphQLResolveInfo, args: DeleteOneFileDataArgs): Promise<FileData | null>;
}
