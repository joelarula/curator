import { FileDataCreateNestedManyWithoutProjectInput } from "../inputs/FileDataCreateNestedManyWithoutProjectInput";
export declare class ProjectCreateWithoutTenantInput {
    name: string;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    files?: FileDataCreateNestedManyWithoutProjectInput | undefined;
}
