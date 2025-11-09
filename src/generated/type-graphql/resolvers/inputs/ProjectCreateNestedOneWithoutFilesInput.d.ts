import { ProjectCreateOrConnectWithoutFilesInput } from "../inputs/ProjectCreateOrConnectWithoutFilesInput";
import { ProjectCreateWithoutFilesInput } from "../inputs/ProjectCreateWithoutFilesInput";
import { ProjectWhereUniqueInput } from "../inputs/ProjectWhereUniqueInput";
export declare class ProjectCreateNestedOneWithoutFilesInput {
    create?: ProjectCreateWithoutFilesInput | undefined;
    connectOrCreate?: ProjectCreateOrConnectWithoutFilesInput | undefined;
    connect?: ProjectWhereUniqueInput | undefined;
}
