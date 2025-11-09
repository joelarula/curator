import { ProjectCreateNestedManyWithoutTenantInput } from "../inputs/ProjectCreateNestedManyWithoutTenantInput";
export declare class TenantCreateInput {
    name: string;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    projects?: ProjectCreateNestedManyWithoutTenantInput | undefined;
}
