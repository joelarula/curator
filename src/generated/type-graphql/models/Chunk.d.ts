import { FileData } from "../models/FileData";
import { Model } from "../models/Model";
export declare class Chunk {
    id: number;
    file?: FileData;
    text: string;
    hash: string;
    selection?: number | null;
    model?: Model;
    fileId: number;
    modelId: number;
}
