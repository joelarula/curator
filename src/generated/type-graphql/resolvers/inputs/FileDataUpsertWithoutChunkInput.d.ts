import { FileDataCreateWithoutChunkInput } from "../inputs/FileDataCreateWithoutChunkInput";
import { FileDataUpdateWithoutChunkInput } from "../inputs/FileDataUpdateWithoutChunkInput";
import { FileDataWhereInput } from "../inputs/FileDataWhereInput";
export declare class FileDataUpsertWithoutChunkInput {
    update: FileDataUpdateWithoutChunkInput;
    create: FileDataCreateWithoutChunkInput;
    where?: FileDataWhereInput | undefined;
}
