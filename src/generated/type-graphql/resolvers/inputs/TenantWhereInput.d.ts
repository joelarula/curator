import { DateTimeFilter } from "../inputs/DateTimeFilter";
import { IntFilter } from "../inputs/IntFilter";
import { ProjectListRelationFilter } from "../inputs/ProjectListRelationFilter";
import { StringFilter } from "../inputs/StringFilter";
export declare class TenantWhereInput {
    AND?: TenantWhereInput[] | undefined;
    OR?: TenantWhereInput[] | undefined;
    NOT?: TenantWhereInput[] | undefined;
    id?: IntFilter | undefined;
    name?: StringFilter | undefined;
    createdAt?: DateTimeFilter | undefined;
    updatedAt?: DateTimeFilter | undefined;
    projects?: ProjectListRelationFilter | undefined;
}
