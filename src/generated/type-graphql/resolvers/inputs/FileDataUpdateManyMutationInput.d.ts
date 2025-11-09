import { DateTimeFieldUpdateOperationsInput } from "../inputs/DateTimeFieldUpdateOperationsInput";
import { IntFieldUpdateOperationsInput } from "../inputs/IntFieldUpdateOperationsInput";
import { NullableBytesFieldUpdateOperationsInput } from "../inputs/NullableBytesFieldUpdateOperationsInput";
import { NullableStringFieldUpdateOperationsInput } from "../inputs/NullableStringFieldUpdateOperationsInput";
import { StringFieldUpdateOperationsInput } from "../inputs/StringFieldUpdateOperationsInput";
export declare class FileDataUpdateManyMutationInput {
    name?: StringFieldUpdateOperationsInput | undefined;
    mimeType?: StringFieldUpdateOperationsInput | undefined;
    source?: NullableStringFieldUpdateOperationsInput | undefined;
    hash?: StringFieldUpdateOperationsInput | undefined;
    size?: IntFieldUpdateOperationsInput | undefined;
    content?: NullableBytesFieldUpdateOperationsInput | undefined;
    createdAt?: DateTimeFieldUpdateOperationsInput | undefined;
    updatedAt?: DateTimeFieldUpdateOperationsInput | undefined;
}
