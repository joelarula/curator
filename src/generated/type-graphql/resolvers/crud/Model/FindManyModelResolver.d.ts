import type { GraphQLResolveInfo } from "graphql";
import { FindManyModelArgs } from "./args/FindManyModelArgs";
import { Model } from "../../../models/Model";
export declare class FindManyModelResolver {
    models(ctx: any, info: GraphQLResolveInfo, args: FindManyModelArgs): Promise<Model[]>;
}
