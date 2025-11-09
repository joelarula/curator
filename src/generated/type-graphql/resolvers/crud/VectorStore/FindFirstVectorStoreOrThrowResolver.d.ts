import type { GraphQLResolveInfo } from "graphql";
import { FindFirstVectorStoreOrThrowArgs } from "./args/FindFirstVectorStoreOrThrowArgs";
import { VectorStore } from "../../../models/VectorStore";
export declare class FindFirstVectorStoreOrThrowResolver {
    findFirstVectorStoreOrThrow(ctx: any, info: GraphQLResolveInfo, args: FindFirstVectorStoreOrThrowArgs): Promise<VectorStore | null>;
}
