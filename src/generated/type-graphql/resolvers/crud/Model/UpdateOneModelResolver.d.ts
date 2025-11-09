import type { GraphQLResolveInfo } from "graphql";
import { UpdateOneModelArgs } from "./args/UpdateOneModelArgs";
import { Model } from "../../../models/Model";
export declare class UpdateOneModelResolver {
    updateOneModel(ctx: any, info: GraphQLResolveInfo, args: UpdateOneModelArgs): Promise<Model | null>;
}
