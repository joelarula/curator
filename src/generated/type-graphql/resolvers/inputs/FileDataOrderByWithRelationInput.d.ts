import { ChunkOrderByRelationAggregateInput } from "../inputs/ChunkOrderByRelationAggregateInput";
import { ProjectOrderByWithRelationInput } from "../inputs/ProjectOrderByWithRelationInput";
import { SortOrderInput } from "../inputs/SortOrderInput";
export declare class FileDataOrderByWithRelationInput {
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
    project?: ProjectOrderByWithRelationInput | undefined;
    Chunk?: ChunkOrderByRelationAggregateInput | undefined;
}
