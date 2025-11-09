import { FileDataCreateNestedManyWithoutProjectInput } from "../inputs/FileDataCreateNestedManyWithoutProjectInput";
import { TenantCreateNestedOneWithoutProjectsInput } from "../inputs/TenantCreateNestedOneWithoutProjectsInput";
export declare class ProjectCreateInput {
    name: string;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    tenant: TenantCreateNestedOneWithoutProjectsInput;
    files?: FileDataCreateNestedManyWithoutProjectInput | undefined;
}
