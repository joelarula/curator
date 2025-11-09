import type { GraphQLResolveInfo } from "graphql";
import { CreateOneFileDataArgs } from "./args/CreateOneFileDataArgs";
import { FileData } from "../../../models/FileData";
export declare class CreateOneFileDataResolver {
    createOneFileData(ctx: any, info: GraphQLResolveInfo, args: CreateOneFileDataArgs): Promise<FileData>;
}
