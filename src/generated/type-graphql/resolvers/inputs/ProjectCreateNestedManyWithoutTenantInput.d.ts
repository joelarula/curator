import { ProjectCreateManyTenantInputEnvelope } from "../inputs/ProjectCreateManyTenantInputEnvelope";
import { ProjectCreateOrConnectWithoutTenantInput } from "../inputs/ProjectCreateOrConnectWithoutTenantInput";
import { ProjectCreateWithoutTenantInput } from "../inputs/ProjectCreateWithoutTenantInput";
import { ProjectWhereUniqueInput } from "../inputs/ProjectWhereUniqueInput";
export declare class ProjectCreateNestedManyWithoutTenantInput {
    create?: ProjectCreateWithoutTenantInput[] | undefined;
    connectOrCreate?: ProjectCreateOrConnectWithoutTenantInput[] | undefined;
    createMany?: ProjectCreateManyTenantInputEnvelope | undefined;
    connect?: ProjectWhereUniqueInput[] | undefined;
}
