import { ChunkListRelationFilter } from "../inputs/ChunkListRelationFilter";
import { IntFilter } from "../inputs/IntFilter";
import { StringFilter } from "../inputs/StringFilter";
import { StringNullableFilter } from "../inputs/StringNullableFilter";
export declare class ModelWhereInput {
    AND?: ModelWhereInput[] | undefined;
    OR?: ModelWhereInput[] | undefined;
    NOT?: ModelWhereInput[] | undefined;
    id?: IntFilter | undefined;
    name?: StringFilter | undefined;
    columnName?: StringFilter | undefined;
    source?: StringNullableFilter | undefined;
    chunks?: ChunkListRelationFilter | undefined;
}
