import { SortOrderInput } from "../inputs/SortOrderInput";
import { VectorStoreCountOrderByAggregateInput } from "../inputs/VectorStoreCountOrderByAggregateInput";
import { VectorStoreMaxOrderByAggregateInput } from "../inputs/VectorStoreMaxOrderByAggregateInput";
import { VectorStoreMinOrderByAggregateInput } from "../inputs/VectorStoreMinOrderByAggregateInput";
export declare class VectorStoreOrderByWithAggregationInput {
    id?: "asc" | "desc" | undefined;
    namespace?: "asc" | "desc" | undefined;
    content?: "asc" | "desc" | undefined;
    metadata?: SortOrderInput | undefined;
    createdAt?: "asc" | "desc" | undefined;
    _count?: VectorStoreCountOrderByAggregateInput | undefined;
    _max?: VectorStoreMaxOrderByAggregateInput | undefined;
    _min?: VectorStoreMinOrderByAggregateInput | undefined;
}
