import { TenantCreateNestedOneWithoutProjectsInput } from "../inputs/TenantCreateNestedOneWithoutProjectsInput";
export declare class ProjectCreateWithoutFilesInput {
    name: string;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    tenant: TenantCreateNestedOneWithoutProjectsInput;
}
