import { ModelCreateOrConnectWithoutChunksInput } from "../inputs/ModelCreateOrConnectWithoutChunksInput";
import { ModelCreateWithoutChunksInput } from "../inputs/ModelCreateWithoutChunksInput";
import { ModelUpdateToOneWithWhereWithoutChunksInput } from "../inputs/ModelUpdateToOneWithWhereWithoutChunksInput";
import { ModelUpsertWithoutChunksInput } from "../inputs/ModelUpsertWithoutChunksInput";
import { ModelWhereUniqueInput } from "../inputs/ModelWhereUniqueInput";
export declare class ModelUpdateOneRequiredWithoutChunksNestedInput {
    create?: ModelCreateWithoutChunksInput | undefined;
    connectOrCreate?: ModelCreateOrConnectWithoutChunksInput | undefined;
    upsert?: ModelUpsertWithoutChunksInput | undefined;
    connect?: ModelWhereUniqueInput | undefined;
    update?: ModelUpdateToOneWithWhereWithoutChunksInput | undefined;
}
