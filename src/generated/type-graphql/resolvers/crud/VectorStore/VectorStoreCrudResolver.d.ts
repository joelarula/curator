import type { GraphQLResolveInfo } from "graphql";
import { AggregateVectorStoreArgs } from "./args/AggregateVectorStoreArgs";
import { DeleteManyVectorStoreArgs } from "./args/DeleteManyVectorStoreArgs";
import { DeleteOneVectorStoreArgs } from "./args/DeleteOneVectorStoreArgs";
import { FindFirstVectorStoreArgs } from "./args/FindFirstVectorStoreArgs";
import { FindFirstVectorStoreOrThrowArgs } from "./args/FindFirstVectorStoreOrThrowArgs";
import { FindManyVectorStoreArgs } from "./args/FindManyVectorStoreArgs";
import { FindUniqueVectorStoreArgs } from "./args/FindUniqueVectorStoreArgs";
import { FindUniqueVectorStoreOrThrowArgs } from "./args/FindUniqueVectorStoreOrThrowArgs";
import { GroupByVectorStoreArgs } from "./args/GroupByVectorStoreArgs";
import { UpdateManyVectorStoreArgs } from "./args/UpdateManyVectorStoreArgs";
import { UpdateOneVectorStoreArgs } from "./args/UpdateOneVectorStoreArgs";
import { VectorStore } from "../../../models/VectorStore";
import { AffectedRowsOutput } from "../../outputs/AffectedRowsOutput";
import { AggregateVectorStore } from "../../outputs/AggregateVectorStore";
import { VectorStoreGroupBy } from "../../outputs/VectorStoreGroupBy";
export declare class VectorStoreCrudResolver {
    aggregateVectorStore(ctx: any, info: GraphQLResolveInfo, args: AggregateVectorStoreArgs): Promise<AggregateVectorStore>;
    deleteManyVectorStore(ctx: any, info: GraphQLResolveInfo, args: DeleteManyVectorStoreArgs): Promise<AffectedRowsOutput>;
    deleteOneVectorStore(ctx: any, info: GraphQLResolveInfo, args: DeleteOneVectorStoreArgs): Promise<VectorStore | null>;
    findFirstVectorStore(ctx: any, info: GraphQLResolveInfo, args: FindFirstVectorStoreArgs): Promise<VectorStore | null>;
    findFirstVectorStoreOrThrow(ctx: any, info: GraphQLResolveInfo, args: FindFirstVectorStoreOrThrowArgs): Promise<VectorStore | null>;
    vectorStores(ctx: any, info: GraphQLResolveInfo, args: FindManyVectorStoreArgs): Promise<VectorStore[]>;
    vectorStore(ctx: any, info: GraphQLResolveInfo, args: FindUniqueVectorStoreArgs): Promise<VectorStore | null>;
    getVectorStore(ctx: any, info: GraphQLResolveInfo, args: FindUniqueVectorStoreOrThrowArgs): Promise<VectorStore | null>;
    groupByVectorStore(ctx: any, info: GraphQLResolveInfo, args: GroupByVectorStoreArgs): Promise<VectorStoreGroupBy[]>;
    updateManyVectorStore(ctx: any, info: GraphQLResolveInfo, args: UpdateManyVectorStoreArgs): Promise<AffectedRowsOutput>;
    updateOneVectorStore(ctx: any, info: GraphQLResolveInfo, args: UpdateOneVectorStoreArgs): Promise<VectorStore | null>;
}
