import { TenantAvgOrderByAggregateInput } from "../inputs/TenantAvgOrderByAggregateInput";
import { TenantCountOrderByAggregateInput } from "../inputs/TenantCountOrderByAggregateInput";
import { TenantMaxOrderByAggregateInput } from "../inputs/TenantMaxOrderByAggregateInput";
import { TenantMinOrderByAggregateInput } from "../inputs/TenantMinOrderByAggregateInput";
import { TenantSumOrderByAggregateInput } from "../inputs/TenantSumOrderByAggregateInput";
export declare class TenantOrderByWithAggregationInput {
    id?: "asc" | "desc" | undefined;
    name?: "asc" | "desc" | undefined;
    createdAt?: "asc" | "desc" | undefined;
    updatedAt?: "asc" | "desc" | undefined;
    _count?: TenantCountOrderByAggregateInput | undefined;
    _avg?: TenantAvgOrderByAggregateInput | undefined;
    _max?: TenantMaxOrderByAggregateInput | undefined;
    _min?: TenantMinOrderByAggregateInput | undefined;
    _sum?: TenantSumOrderByAggregateInput | undefined;
}
