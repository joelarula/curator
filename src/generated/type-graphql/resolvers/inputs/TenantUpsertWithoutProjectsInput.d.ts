import { TenantCreateWithoutProjectsInput } from "../inputs/TenantCreateWithoutProjectsInput";
import { TenantUpdateWithoutProjectsInput } from "../inputs/TenantUpdateWithoutProjectsInput";
import { TenantWhereInput } from "../inputs/TenantWhereInput";
export declare class TenantUpsertWithoutProjectsInput {
    update: TenantUpdateWithoutProjectsInput;
    create: TenantCreateWithoutProjectsInput;
    where?: TenantWhereInput | undefined;
}
