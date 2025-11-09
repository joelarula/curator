import type { GraphQLResolveInfo } from "graphql";
import { UpsertOneModelArgs } from "./args/UpsertOneModelArgs";
import { Model } from "../../../models/Model";
export declare class UpsertOneModelResolver {
    upsertOneModel(ctx: any, info: GraphQLResolveInfo, args: UpsertOneModelArgs): Promise<Model>;
}
