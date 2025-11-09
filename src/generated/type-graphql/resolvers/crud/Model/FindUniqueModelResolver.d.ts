import type { GraphQLResolveInfo } from "graphql";
import { FindUniqueModelArgs } from "./args/FindUniqueModelArgs";
import { Model } from "../../../models/Model";
export declare class FindUniqueModelResolver {
    model(ctx: any, info: GraphQLResolveInfo, args: FindUniqueModelArgs): Promise<Model | null>;
}
