import { ChunkAvgOrderByAggregateInput } from "../inputs/ChunkAvgOrderByAggregateInput";
import { ChunkCountOrderByAggregateInput } from "../inputs/ChunkCountOrderByAggregateInput";
import { ChunkMaxOrderByAggregateInput } from "../inputs/ChunkMaxOrderByAggregateInput";
import { ChunkMinOrderByAggregateInput } from "../inputs/ChunkMinOrderByAggregateInput";
import { ChunkSumOrderByAggregateInput } from "../inputs/ChunkSumOrderByAggregateInput";
import { SortOrderInput } from "../inputs/SortOrderInput";
export declare class ChunkOrderByWithAggregationInput {
    id?: "asc" | "desc" | undefined;
    text?: "asc" | "desc" | undefined;
    hash?: "asc" | "desc" | undefined;
    selection?: SortOrderInput | undefined;
    fileId?: "asc" | "desc" | undefined;
    modelId?: "asc" | "desc" | undefined;
    _count?: ChunkCountOrderByAggregateInput | undefined;
    _avg?: ChunkAvgOrderByAggregateInput | undefined;
    _max?: ChunkMaxOrderByAggregateInput | undefined;
    _min?: ChunkMinOrderByAggregateInput | undefined;
    _sum?: ChunkSumOrderByAggregateInput | undefined;
}
