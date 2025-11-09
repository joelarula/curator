import { ProjectCreateNestedOneWithoutFilesInput } from "../inputs/ProjectCreateNestedOneWithoutFilesInput";
export declare class FileDataCreateWithoutChunkInput {
    name: string;
    mimeType: string;
    source?: string | undefined;
    hash: string;
    size: number;
    content?: Buffer | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    project: ProjectCreateNestedOneWithoutFilesInput;
}
