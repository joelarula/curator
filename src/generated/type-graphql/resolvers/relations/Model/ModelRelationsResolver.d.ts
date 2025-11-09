import type { GraphQLResolveInfo } from "graphql";
import { Chunk } from "../../../models/Chunk";
import { Model } from "../../../models/Model";
import { ModelChunksArgs } from "./args/ModelChunksArgs";
export declare class ModelRelationsResolver {
    chunks(model: Model, ctx: any, info: GraphQLResolveInfo, args: ModelChunksArgs): Promise<Chunk[]>;
}
