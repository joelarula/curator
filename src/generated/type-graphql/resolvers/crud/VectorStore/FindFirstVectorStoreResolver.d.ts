import type { GraphQLResolveInfo } from "graphql";
import { FindFirstVectorStoreArgs } from "./args/FindFirstVectorStoreArgs";
import { VectorStore } from "../../../models/VectorStore";
export declare class FindFirstVectorStoreResolver {
    findFirstVectorStore(ctx: any, info: GraphQLResolveInfo, args: FindFirstVectorStoreArgs): Promise<VectorStore | null>;
}
