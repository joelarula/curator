import { SortOrderInput } from "../inputs/SortOrderInput";
export declare class VectorStoreOrderByWithRelationInput {
    id?: "asc" | "desc" | undefined;
    namespace?: "asc" | "desc" | undefined;
    content?: "asc" | "desc" | undefined;
    metadata?: SortOrderInput | undefined;
    createdAt?: "asc" | "desc" | undefined;
}
