import { Project } from "../../models/Project";
export declare class CreateManyAndReturnFileData {
    id: number;
    name: string;
    mimeType: string;
    source: string | null;
    hash: string;
    size: number;
    content: Buffer | null;
    projectId: number;
    createdAt: Date;
    updatedAt: Date;
    project: Project;
}
