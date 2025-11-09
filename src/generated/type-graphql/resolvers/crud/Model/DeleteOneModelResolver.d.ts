import type { GraphQLResolveInfo } from "graphql";
import { DeleteOneModelArgs } from "./args/DeleteOneModelArgs";
import { Model } from "../../../models/Model";
export declare class DeleteOneModelResolver {
    deleteOneModel(ctx: any, info: GraphQLResolveInfo, args: DeleteOneModelArgs): Promise<Model | null>;
}
