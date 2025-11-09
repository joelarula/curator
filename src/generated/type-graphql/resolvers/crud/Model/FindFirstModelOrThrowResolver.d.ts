import type { GraphQLResolveInfo } from "graphql";
import { FindFirstModelOrThrowArgs } from "./args/FindFirstModelOrThrowArgs";
import { Model } from "../../../models/Model";
export declare class FindFirstModelOrThrowResolver {
    findFirstModelOrThrow(ctx: any, info: GraphQLResolveInfo, args: FindFirstModelOrThrowArgs): Promise<Model | null>;
}
