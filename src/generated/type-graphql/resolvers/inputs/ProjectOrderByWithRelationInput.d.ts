import { FileDataOrderByRelationAggregateInput } from "../inputs/FileDataOrderByRelationAggregateInput";
import { TenantOrderByWithRelationInput } from "../inputs/TenantOrderByWithRelationInput";
export declare class ProjectOrderByWithRelationInput {
    id?: "asc" | "desc" | undefined;
    name?: "asc" | "desc" | undefined;
    tenantId?: "asc" | "desc" | undefined;
    createdAt?: "asc" | "desc" | undefined;
    updatedAt?: "asc" | "desc" | undefined;
    tenant?: TenantOrderByWithRelationInput | undefined;
    files?: FileDataOrderByRelationAggregateInput | undefined;
}
