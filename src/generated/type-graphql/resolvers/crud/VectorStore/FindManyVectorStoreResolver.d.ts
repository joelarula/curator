import type { GraphQLResolveInfo } from "graphql";
import { FindManyVectorStoreArgs } from "./args/FindManyVectorStoreArgs";
import { VectorStore } from "../../../models/VectorStore";
export declare class FindManyVectorStoreResolver {
    vectorStores(ctx: any, info: GraphQLResolveInfo, args: FindManyVectorStoreArgs): Promise<VectorStore[]>;
}
