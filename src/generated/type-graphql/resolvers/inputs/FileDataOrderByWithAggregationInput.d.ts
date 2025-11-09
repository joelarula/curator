import { FileDataAvgOrderByAggregateInput } from "../inputs/FileDataAvgOrderByAggregateInput";
import { FileDataCountOrderByAggregateInput } from "../inputs/FileDataCountOrderByAggregateInput";
import { FileDataMaxOrderByAggregateInput } from "../inputs/FileDataMaxOrderByAggregateInput";
import { FileDataMinOrderByAggregateInput } from "../inputs/FileDataMinOrderByAggregateInput";
import { FileDataSumOrderByAggregateInput } from "../inputs/FileDataSumOrderByAggregateInput";
import { SortOrderInput } from "../inputs/SortOrderInput";
export declare class FileDataOrderByWithAggregationInput {
    id?: "asc" | "desc" | undefined;
    name?: "asc" | "desc" | undefined;
    mimeType?: "asc" | "desc" | undefined;
    source?: SortOrderInput | undefined;
    hash?: "asc" | "desc" | undefined;
    size?: "asc" | "desc" | undefined;
    content?: SortOrderInput | undefined;
    projectId?: "asc" | "desc" | undefined;
    createdAt?: "asc" | "desc" | undefined;
    updatedAt?: "asc" | "desc" | undefined;
    _count?: FileDataCountOrderByAggregateInput | undefined;
    _avg?: FileDataAvgOrderByAggregateInput | undefined;
    _max?: FileDataMaxOrderByAggregateInput | undefined;
    _min?: FileDataMinOrderByAggregateInput | undefined;
    _sum?: FileDataSumOrderByAggregateInput | undefined;
}
