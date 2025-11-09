import type { GraphQLResolveInfo } from "graphql";
import { UpdateOneVectorStoreArgs } from "./args/UpdateOneVectorStoreArgs";
import { VectorStore } from "../../../models/VectorStore";
export declare class UpdateOneVectorStoreResolver {
    updateOneVectorStore(ctx: any, info: GraphQLResolveInfo, args: UpdateOneVectorStoreArgs): Promise<VectorStore | null>;
}
