import { DateTimeFieldUpdateOperationsInput } from "../inputs/DateTimeFieldUpdateOperationsInput";
import { FileDataUpdateManyWithoutProjectNestedInput } from "../inputs/FileDataUpdateManyWithoutProjectNestedInput";
import { StringFieldUpdateOperationsInput } from "../inputs/StringFieldUpdateOperationsInput";
import { TenantUpdateOneRequiredWithoutProjectsNestedInput } from "../inputs/TenantUpdateOneRequiredWithoutProjectsNestedInput";
export declare class ProjectUpdateInput {
    name?: StringFieldUpdateOperationsInput | undefined;
    createdAt?: DateTimeFieldUpdateOperationsInput | undefined;
    updatedAt?: DateTimeFieldUpdateOperationsInput | undefined;
    tenant?: TenantUpdateOneRequiredWithoutProjectsNestedInput | undefined;
    files?: FileDataUpdateManyWithoutProjectNestedInput | undefined;
}
