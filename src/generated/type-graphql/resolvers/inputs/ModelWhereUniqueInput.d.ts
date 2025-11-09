import { ChunkListRelationFilter } from "../inputs/ChunkListRelationFilter";
import { ModelWhereInput } from "../inputs/ModelWhereInput";
import { StringFilter } from "../inputs/StringFilter";
import { StringNullableFilter } from "../inputs/StringNullableFilter";
export declare class ModelWhereUniqueInput {
    id?: number | undefined;
    name?: string | undefined;
    AND?: ModelWhereInput[] | undefined;
    OR?: ModelWhereInput[] | undefined;
    NOT?: ModelWhereInput[] | undefined;
    columnName?: StringFilter | undefined;
    source?: StringNullableFilter | undefined;
    chunks?: ChunkListRelationFilter | undefined;
}
