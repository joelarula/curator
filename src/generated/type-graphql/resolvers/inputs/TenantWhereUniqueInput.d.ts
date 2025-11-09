import { DateTimeFilter } from "../inputs/DateTimeFilter";
import { ProjectListRelationFilter } from "../inputs/ProjectListRelationFilter";
import { TenantWhereInput } from "../inputs/TenantWhereInput";
export declare class TenantWhereUniqueInput {
    id?: number | undefined;
    name?: string | undefined;
    AND?: TenantWhereInput[] | undefined;
    OR?: TenantWhereInput[] | undefined;
    NOT?: TenantWhereInput[] | undefined;
    createdAt?: DateTimeFilter | undefined;
    updatedAt?: DateTimeFilter | undefined;
    projects?: ProjectListRelationFilter | undefined;
}
