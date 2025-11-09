import { ModelUpdateOneRequiredWithoutChunksNestedInput } from "../inputs/ModelUpdateOneRequiredWithoutChunksNestedInput";
import { NullableIntFieldUpdateOperationsInput } from "../inputs/NullableIntFieldUpdateOperationsInput";
import { StringFieldUpdateOperationsInput } from "../inputs/StringFieldUpdateOperationsInput";
export declare class ChunkUpdateWithoutFileInput {
    text?: StringFieldUpdateOperationsInput | undefined;
    hash?: StringFieldUpdateOperationsInput | undefined;
    selection?: NullableIntFieldUpdateOperationsInput | undefined;
    model?: ModelUpdateOneRequiredWithoutChunksNestedInput | undefined;
}
