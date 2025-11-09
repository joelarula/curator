import { DateTimeFieldUpdateOperationsInput } from "../inputs/DateTimeFieldUpdateOperationsInput";
import { StringFieldUpdateOperationsInput } from "../inputs/StringFieldUpdateOperationsInput";
import { TenantUpdateOneRequiredWithoutProjectsNestedInput } from "../inputs/TenantUpdateOneRequiredWithoutProjectsNestedInput";
export declare class ProjectUpdateWithoutFilesInput {
    name?: StringFieldUpdateOperationsInput | undefined;
    createdAt?: DateTimeFieldUpdateOperationsInput | undefined;
    updatedAt?: DateTimeFieldUpdateOperationsInput | undefined;
    tenant?: TenantUpdateOneRequiredWithoutProjectsNestedInput | undefined;
}
