import { ProjectAvgOrderByAggregateInput } from "../inputs/ProjectAvgOrderByAggregateInput";
import { ProjectCountOrderByAggregateInput } from "../inputs/ProjectCountOrderByAggregateInput";
import { ProjectMaxOrderByAggregateInput } from "../inputs/ProjectMaxOrderByAggregateInput";
import { ProjectMinOrderByAggregateInput } from "../inputs/ProjectMinOrderByAggregateInput";
import { ProjectSumOrderByAggregateInput } from "../inputs/ProjectSumOrderByAggregateInput";
export declare class ProjectOrderByWithAggregationInput {
    id?: "asc" | "desc" | undefined;
    name?: "asc" | "desc" | undefined;
    tenantId?: "asc" | "desc" | undefined;
    createdAt?: "asc" | "desc" | undefined;
    updatedAt?: "asc" | "desc" | undefined;
    _count?: ProjectCountOrderByAggregateInput | undefined;
    _avg?: ProjectAvgOrderByAggregateInput | undefined;
    _max?: ProjectMaxOrderByAggregateInput | undefined;
    _min?: ProjectMinOrderByAggregateInput | undefined;
    _sum?: ProjectSumOrderByAggregateInput | undefined;
}
