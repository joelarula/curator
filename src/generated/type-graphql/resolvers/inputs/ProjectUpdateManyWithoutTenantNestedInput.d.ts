import { ProjectCreateManyTenantInputEnvelope } from "../inputs/ProjectCreateManyTenantInputEnvelope";
import { ProjectCreateOrConnectWithoutTenantInput } from "../inputs/ProjectCreateOrConnectWithoutTenantInput";
import { ProjectCreateWithoutTenantInput } from "../inputs/ProjectCreateWithoutTenantInput";
import { ProjectScalarWhereInput } from "../inputs/ProjectScalarWhereInput";
import { ProjectUpdateManyWithWhereWithoutTenantInput } from "../inputs/ProjectUpdateManyWithWhereWithoutTenantInput";
import { ProjectUpdateWithWhereUniqueWithoutTenantInput } from "../inputs/ProjectUpdateWithWhereUniqueWithoutTenantInput";
import { ProjectUpsertWithWhereUniqueWithoutTenantInput } from "../inputs/ProjectUpsertWithWhereUniqueWithoutTenantInput";
import { ProjectWhereUniqueInput } from "../inputs/ProjectWhereUniqueInput";
export declare class ProjectUpdateManyWithoutTenantNestedInput {
    create?: ProjectCreateWithoutTenantInput[] | undefined;
    connectOrCreate?: ProjectCreateOrConnectWithoutTenantInput[] | undefined;
    upsert?: ProjectUpsertWithWhereUniqueWithoutTenantInput[] | undefined;
    createMany?: ProjectCreateManyTenantInputEnvelope | undefined;
    set?: ProjectWhereUniqueInput[] | undefined;
    disconnect?: ProjectWhereUniqueInput[] | undefined;
    delete?: ProjectWhereUniqueInput[] | undefined;
    connect?: ProjectWhereUniqueInput[] | undefined;
    update?: ProjectUpdateWithWhereUniqueWithoutTenantInput[] | undefined;
    updateMany?: ProjectUpdateManyWithWhereWithoutTenantInput[] | undefined;
    deleteMany?: ProjectScalarWhereInput[] | undefined;
}
