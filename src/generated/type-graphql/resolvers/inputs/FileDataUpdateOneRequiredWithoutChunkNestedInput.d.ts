import { FileDataCreateOrConnectWithoutChunkInput } from "../inputs/FileDataCreateOrConnectWithoutChunkInput";
import { FileDataCreateWithoutChunkInput } from "../inputs/FileDataCreateWithoutChunkInput";
import { FileDataUpdateToOneWithWhereWithoutChunkInput } from "../inputs/FileDataUpdateToOneWithWhereWithoutChunkInput";
import { FileDataUpsertWithoutChunkInput } from "../inputs/FileDataUpsertWithoutChunkInput";
import { FileDataWhereUniqueInput } from "../inputs/FileDataWhereUniqueInput";
export declare class FileDataUpdateOneRequiredWithoutChunkNestedInput {
    create?: FileDataCreateWithoutChunkInput | undefined;
    connectOrCreate?: FileDataCreateOrConnectWithoutChunkInput | undefined;
    upsert?: FileDataUpsertWithoutChunkInput | undefined;
    connect?: FileDataWhereUniqueInput | undefined;
    update?: FileDataUpdateToOneWithWhereWithoutChunkInput | undefined;
}
