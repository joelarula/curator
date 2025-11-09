import { IntFilter } from "../inputs/IntFilter";
import { IntNullableFilter } from "../inputs/IntNullableFilter";
import { StringFilter } from "../inputs/StringFilter";
export declare class ChunkScalarWhereInput {
    AND?: ChunkScalarWhereInput[] | undefined;
    OR?: ChunkScalarWhereInput[] | undefined;
    NOT?: ChunkScalarWhereInput[] | undefined;
    id?: IntFilter | undefined;
    text?: StringFilter | undefined;
    hash?: StringFilter | undefined;
    selection?: IntNullableFilter | undefined;
    fileId?: IntFilter | undefined;
    modelId?: IntFilter | undefined;
}
