import { TenantCreateOrConnectWithoutProjectsInput } from "../inputs/TenantCreateOrConnectWithoutProjectsInput";
import { TenantCreateWithoutProjectsInput } from "../inputs/TenantCreateWithoutProjectsInput";
import { TenantUpdateToOneWithWhereWithoutProjectsInput } from "../inputs/TenantUpdateToOneWithWhereWithoutProjectsInput";
import { TenantUpsertWithoutProjectsInput } from "../inputs/TenantUpsertWithoutProjectsInput";
import { TenantWhereUniqueInput } from "../inputs/TenantWhereUniqueInput";
export declare class TenantUpdateOneRequiredWithoutProjectsNestedInput {
    create?: TenantCreateWithoutProjectsInput | undefined;
    connectOrCreate?: TenantCreateOrConnectWithoutProjectsInput | undefined;
    upsert?: TenantUpsertWithoutProjectsInput | undefined;
    connect?: TenantWhereUniqueInput | undefined;
    update?: TenantUpdateToOneWithWhereWithoutProjectsInput | undefined;
}
