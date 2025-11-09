import { ProjectCountFilesArgs } from "./args/ProjectCountFilesArgs";
export declare class ProjectCount {
    files: number;
    getFiles(root: ProjectCount, args: ProjectCountFilesArgs): number;
}
