import { FileDataUpdateOneRequiredWithoutChunkNestedInput } from "../inputs/FileDataUpdateOneRequiredWithoutChunkNestedInput";
import { ModelUpdateOneRequiredWithoutChunksNestedInput } from "../inputs/ModelUpdateOneRequiredWithoutChunksNestedInput";
import { NullableIntFieldUpdateOperationsInput } from "../inputs/NullableIntFieldUpdateOperationsInput";
import { StringFieldUpdateOperationsInput } from "../inputs/StringFieldUpdateOperationsInput";
export declare class ChunkUpdateInput {
    text?: StringFieldUpdateOperationsInput | undefined;
    hash?: StringFieldUpdateOperationsInput | undefined;
    selection?: NullableIntFieldUpdateOperationsInput | undefined;
    file?: FileDataUpdateOneRequiredWithoutChunkNestedInput | undefined;
    model?: ModelUpdateOneRequiredWithoutChunksNestedInput | undefined;
}
