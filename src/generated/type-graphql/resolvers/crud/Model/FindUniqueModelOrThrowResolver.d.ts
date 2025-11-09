import type { GraphQLResolveInfo } from "graphql";
import { FindUniqueModelOrThrowArgs } from "./args/FindUniqueModelOrThrowArgs";
import { Model } from "../../../models/Model";
export declare class FindUniqueModelOrThrowResolver {
    getModel(ctx: any, info: GraphQLResolveInfo, args: FindUniqueModelOrThrowArgs): Promise<Model | null>;
}
