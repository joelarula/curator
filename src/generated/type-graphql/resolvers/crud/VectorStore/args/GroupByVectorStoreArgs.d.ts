import { VectorStoreOrderByWithAggregationInput } from "../../../inputs/VectorStoreOrderByWithAggregationInput";
import { VectorStoreScalarWhereWithAggregatesInput } from "../../../inputs/VectorStoreScalarWhereWithAggregatesInput";
import { VectorStoreWhereInput } from "../../../inputs/VectorStoreWhereInput";
export declare class GroupByVectorStoreArgs {
    where?: VectorStoreWhereInput | undefined;
    orderBy?: VectorStoreOrderByWithAggregationInput[] | undefined;
    by: Array<"id" | "namespace" | "content" | "metadata" | "createdAt">;
    having?: VectorStoreScalarWhereWithAggregatesInput | undefined;
    take?: number | undefined;
    skip?: number | undefined;
}
