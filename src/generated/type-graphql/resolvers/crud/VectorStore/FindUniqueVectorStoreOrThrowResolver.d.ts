import type { GraphQLResolveInfo } from "graphql";
import { FindUniqueVectorStoreOrThrowArgs } from "./args/FindUniqueVectorStoreOrThrowArgs";
import { VectorStore } from "../../../models/VectorStore";
export declare class FindUniqueVectorStoreOrThrowResolver {
    getVectorStore(ctx: any, info: GraphQLResolveInfo, args: FindUniqueVectorStoreOrThrowArgs): Promise<VectorStore | null>;
}
