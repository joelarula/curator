import type { GraphQLResolveInfo } from "graphql";
import { DeleteOneVectorStoreArgs } from "./args/DeleteOneVectorStoreArgs";
import { VectorStore } from "../../../models/VectorStore";
export declare class DeleteOneVectorStoreResolver {
    deleteOneVectorStore(ctx: any, info: GraphQLResolveInfo, args: DeleteOneVectorStoreArgs): Promise<VectorStore | null>;
}
