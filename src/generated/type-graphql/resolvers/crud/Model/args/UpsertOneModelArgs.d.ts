import { ModelCreateInput } from "../../../inputs/ModelCreateInput";
import { ModelUpdateInput } from "../../../inputs/ModelUpdateInput";
import { ModelWhereUniqueInput } from "../../../inputs/ModelWhereUniqueInput";
export declare class UpsertOneModelArgs {
    where: ModelWhereUniqueInput;
    create: ModelCreateInput;
    update: ModelUpdateInput;
}
