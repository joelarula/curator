import { ModelAvgOrderByAggregateInput } from "../inputs/ModelAvgOrderByAggregateInput";
import { ModelCountOrderByAggregateInput } from "../inputs/ModelCountOrderByAggregateInput";
import { ModelMaxOrderByAggregateInput } from "../inputs/ModelMaxOrderByAggregateInput";
import { ModelMinOrderByAggregateInput } from "../inputs/ModelMinOrderByAggregateInput";
import { ModelSumOrderByAggregateInput } from "../inputs/ModelSumOrderByAggregateInput";
import { SortOrderInput } from "../inputs/SortOrderInput";
export declare class ModelOrderByWithAggregationInput {
    id?: "asc" | "desc" | undefined;
    name?: "asc" | "desc" | undefined;
    columnName?: "asc" | "desc" | undefined;
    source?: SortOrderInput | undefined;
    _count?: ModelCountOrderByAggregateInput | undefined;
    _avg?: ModelAvgOrderByAggregateInput | undefined;
    _max?: ModelMaxOrderByAggregateInput | undefined;
    _min?: ModelMinOrderByAggregateInput | undefined;
    _sum?: ModelSumOrderByAggregateInput | undefined;
}
