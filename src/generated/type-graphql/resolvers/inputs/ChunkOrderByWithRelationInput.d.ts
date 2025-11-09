import { FileDataOrderByWithRelationInput } from "../inputs/FileDataOrderByWithRelationInput";
import { ModelOrderByWithRelationInput } from "../inputs/ModelOrderByWithRelationInput";
import { SortOrderInput } from "../inputs/SortOrderInput";
export declare class ChunkOrderByWithRelationInput {
    id?: "asc" | "desc" | undefined;
    text?: "asc" | "desc" | undefined;
    hash?: "asc" | "desc" | undefined;
    selection?: SortOrderInput | undefined;
    fileId?: "asc" | "desc" | undefined;
    modelId?: "asc" | "desc" | undefined;
    file?: FileDataOrderByWithRelationInput | undefined;
    model?: ModelOrderByWithRelationInput | undefined;
}
