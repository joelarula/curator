import { ChunkUpdateManyWithoutModelNestedInput } from "../inputs/ChunkUpdateManyWithoutModelNestedInput";
import { NullableStringFieldUpdateOperationsInput } from "../inputs/NullableStringFieldUpdateOperationsInput";
import { StringFieldUpdateOperationsInput } from "../inputs/StringFieldUpdateOperationsInput";
export declare class ModelUpdateInput {
    name?: StringFieldUpdateOperationsInput | undefined;
    columnName?: StringFieldUpdateOperationsInput | undefined;
    source?: NullableStringFieldUpdateOperationsInput | undefined;
    chunks?: ChunkUpdateManyWithoutModelNestedInput | undefined;
}
