import { ProjectCreateOrConnectWithoutFilesInput } from "../inputs/ProjectCreateOrConnectWithoutFilesInput";
import { ProjectCreateWithoutFilesInput } from "../inputs/ProjectCreateWithoutFilesInput";
import { ProjectUpdateToOneWithWhereWithoutFilesInput } from "../inputs/ProjectUpdateToOneWithWhereWithoutFilesInput";
import { ProjectUpsertWithoutFilesInput } from "../inputs/ProjectUpsertWithoutFilesInput";
import { ProjectWhereUniqueInput } from "../inputs/ProjectWhereUniqueInput";
export declare class ProjectUpdateOneRequiredWithoutFilesNestedInput {
    create?: ProjectCreateWithoutFilesInput | undefined;
    connectOrCreate?: ProjectCreateOrConnectWithoutFilesInput | undefined;
    upsert?: ProjectUpsertWithoutFilesInput | undefined;
    connect?: ProjectWhereUniqueInput | undefined;
    update?: ProjectUpdateToOneWithWhereWithoutFilesInput | undefined;
}
