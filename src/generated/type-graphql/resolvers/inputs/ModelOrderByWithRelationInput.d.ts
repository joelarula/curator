import { ChunkOrderByRelationAggregateInput } from "../inputs/ChunkOrderByRelationAggregateInput";
import { SortOrderInput } from "../inputs/SortOrderInput";
export declare class ModelOrderByWithRelationInput {
    id?: "asc" | "desc" | undefined;
    name?: "asc" | "desc" | undefined;
    columnName?: "asc" | "desc" | undefined;
    source?: SortOrderInput | undefined;
    chunks?: ChunkOrderByRelationAggregateInput | undefined;
}
