import { Prisma } from "@prisma/client";
import { DateTimeFieldUpdateOperationsInput } from "../inputs/DateTimeFieldUpdateOperationsInput";
import { StringFieldUpdateOperationsInput } from "../inputs/StringFieldUpdateOperationsInput";
export declare class VectorStoreUpdateManyMutationInput {
    id?: StringFieldUpdateOperationsInput | undefined;
    namespace?: StringFieldUpdateOperationsInput | undefined;
    content?: StringFieldUpdateOperationsInput | undefined;
    metadata?: Prisma.InputJsonValue | undefined;
    createdAt?: DateTimeFieldUpdateOperationsInput | undefined;
}
