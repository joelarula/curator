import type { GraphQLResolveInfo } from "graphql";
import { FindFirstModelArgs } from "./args/FindFirstModelArgs";
import { Model } from "../../../models/Model";
export declare class FindFirstModelResolver {
    findFirstModel(ctx: any, info: GraphQLResolveInfo, args: FindFirstModelArgs): Promise<Model | null>;
}
