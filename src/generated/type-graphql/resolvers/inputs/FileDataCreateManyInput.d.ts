export declare class FileDataCreateManyInput {
    id?: number | undefined;
    name: string;
    mimeType: string;
    source?: string | undefined;
    hash: string;
    size: number;
    content?: Buffer | undefined;
    projectId: number;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
}
