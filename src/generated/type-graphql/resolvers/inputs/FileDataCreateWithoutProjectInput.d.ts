import { ChunkCreateNestedManyWithoutFileInput } from "../inputs/ChunkCreateNestedManyWithoutFileInput";
export declare class FileDataCreateWithoutProjectInput {
    name: string;
    mimeType: string;
    source?: string | undefined;
    hash: string;
    size: number;
    content?: Buffer | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    Chunk?: ChunkCreateNestedManyWithoutFileInput | undefined;
}
