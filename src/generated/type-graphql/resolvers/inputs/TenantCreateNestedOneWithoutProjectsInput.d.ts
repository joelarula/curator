import { TenantCreateOrConnectWithoutProjectsInput } from "../inputs/TenantCreateOrConnectWithoutProjectsInput";
import { TenantCreateWithoutProjectsInput } from "../inputs/TenantCreateWithoutProjectsInput";
import { TenantWhereUniqueInput } from "../inputs/TenantWhereUniqueInput";
export declare class TenantCreateNestedOneWithoutProjectsInput {
    create?: TenantCreateWithoutProjectsInput | undefined;
    connectOrCreate?: TenantCreateOrConnectWithoutProjectsInput | undefined;
    connect?: TenantWhereUniqueInput | undefined;
}
