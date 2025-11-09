import { FileDataRelationFilter } from "../inputs/FileDataRelationFilter";
import { IntFilter } from "../inputs/IntFilter";
import { IntNullableFilter } from "../inputs/IntNullableFilter";
import { ModelRelationFilter } from "../inputs/ModelRelationFilter";
import { StringFilter } from "../inputs/StringFilter";
export declare class ChunkWhereInput {
    AND?: ChunkWhereInput[] | undefined;
    OR?: ChunkWhereInput[] | undefined;
    NOT?: ChunkWhereInput[] | undefined;
    id?: IntFilter | undefined;
    text?: StringFilter | undefined;
    hash?: StringFilter | undefined;
    selection?: IntNullableFilter | undefined;
    fileId?: IntFilter | undefined;
    modelId?: IntFilter | undefined;
    file?: FileDataRelationFilter | undefined;
    model?: ModelRelationFilter | undefined;
}
