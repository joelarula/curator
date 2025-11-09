import { SortOrderInput } from "../inputs/SortOrderInput";
export declare class DocumentOrderByWithRelationInput {
    id?: "asc" | "desc" | undefined;
    content?: "asc" | "desc" | undefined;
    metadata?: SortOrderInput | undefined;
    createdAt?: "asc" | "desc" | undefined;
    updatedAt?: "asc" | "desc" | undefined;
}
