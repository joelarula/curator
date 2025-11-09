import { Chunk } from "../models/Chunk";
import { Project } from "../models/Project";
import { FileDataCount } from "../resolvers/outputs/FileDataCount";
export declare class FileData {
    id: number;
    project?: Project;
    name: string;
    mimeType: string;
    source?: string | null;
    hash: string;
    size: number;
    content?: Buffer | null;
    Chunk?: Chunk[];
    projectId: number;
    createdAt: Date;
    updatedAt: Date;
    _count?: FileDataCount | null;
}
