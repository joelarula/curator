import { DateTimeFilter } from "../inputs/DateTimeFilter";
import { FileDataListRelationFilter } from "../inputs/FileDataListRelationFilter";
import { IntFilter } from "../inputs/IntFilter";
import { ProjectWhereInput } from "../inputs/ProjectWhereInput";
import { TenantRelationFilter } from "../inputs/TenantRelationFilter";
export declare class ProjectWhereUniqueInput {
    id?: number | undefined;
    name?: string | undefined;
    AND?: ProjectWhereInput[] | undefined;
    OR?: ProjectWhereInput[] | undefined;
    NOT?: ProjectWhereInput[] | undefined;
    tenantId?: IntFilter | undefined;
    createdAt?: DateTimeFilter | undefined;
    updatedAt?: DateTimeFilter | undefined;
    tenant?: TenantRelationFilter | undefined;
    files?: FileDataListRelationFilter | undefined;
}
