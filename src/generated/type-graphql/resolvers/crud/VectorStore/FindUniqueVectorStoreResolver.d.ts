import type { GraphQLResolveInfo } from "graphql";
import { FindUniqueVectorStoreArgs } from "./args/FindUniqueVectorStoreArgs";
import { VectorStore } from "../../../models/VectorStore";
export declare class FindUniqueVectorStoreResolver {
    vectorStore(ctx: any, info: GraphQLResolveInfo, args: FindUniqueVectorStoreArgs): Promise<VectorStore | null>;
}
