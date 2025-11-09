import type { GraphQLResolveInfo } from "graphql";
import { CreateOneModelArgs } from "./args/CreateOneModelArgs";
import { Model } from "../../../models/Model";
export declare class CreateOneModelResolver {
    createOneModel(ctx: any, info: GraphQLResolveInfo, args: CreateOneModelArgs): Promise<Model>;
}
