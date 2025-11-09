import { ProjectCreateWithoutFilesInput } from "../inputs/ProjectCreateWithoutFilesInput";
import { ProjectUpdateWithoutFilesInput } from "../inputs/ProjectUpdateWithoutFilesInput";
import { ProjectWhereInput } from "../inputs/ProjectWhereInput";
export declare class ProjectUpsertWithoutFilesInput {
    update: ProjectUpdateWithoutFilesInput;
    create: ProjectCreateWithoutFilesInput;
    where?: ProjectWhereInput | undefined;
}
