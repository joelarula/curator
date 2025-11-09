import { DateTimeFilter } from "../inputs/DateTimeFilter";
import { FileDataListRelationFilter } from "../inputs/FileDataListRelationFilter";
import { IntFilter } from "../inputs/IntFilter";
import { StringFilter } from "../inputs/StringFilter";
import { TenantRelationFilter } from "../inputs/TenantRelationFilter";
export declare class ProjectWhereInput {
    AND?: ProjectWhereInput[] | undefined;
    OR?: ProjectWhereInput[] | undefined;
    NOT?: ProjectWhereInput[] | undefined;
    id?: IntFilter | undefined;
    name?: StringFilter | undefined;
    tenantId?: IntFilter | undefined;
    createdAt?: DateTimeFilter | undefined;
    updatedAt?: DateTimeFilter | undefined;
    tenant?: TenantRelationFilter | undefined;
    files?: FileDataListRelationFilter | undefined;
}
