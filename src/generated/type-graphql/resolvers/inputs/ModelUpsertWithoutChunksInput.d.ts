import { ModelCreateWithoutChunksInput } from "../inputs/ModelCreateWithoutChunksInput";
import { ModelUpdateWithoutChunksInput } from "../inputs/ModelUpdateWithoutChunksInput";
import { ModelWhereInput } from "../inputs/ModelWhereInput";
export declare class ModelUpsertWithoutChunksInput {
    update: ModelUpdateWithoutChunksInput;
    create: ModelCreateWithoutChunksInput;
    where?: ModelWhereInput | undefined;
}
