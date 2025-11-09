import { FileDataUpdateOneRequiredWithoutChunkNestedInput } from "../inputs/FileDataUpdateOneRequiredWithoutChunkNestedInput";
import { NullableIntFieldUpdateOperationsInput } from "../inputs/NullableIntFieldUpdateOperationsInput";
import { StringFieldUpdateOperationsInput } from "../inputs/StringFieldUpdateOperationsInput";
export declare class ChunkUpdateWithoutModelInput {
    text?: StringFieldUpdateOperationsInput | undefined;
    hash?: StringFieldUpdateOperationsInput | undefined;
    selection?: NullableIntFieldUpdateOperationsInput | undefined;
    file?: FileDataUpdateOneRequiredWithoutChunkNestedInput | undefined;
}
