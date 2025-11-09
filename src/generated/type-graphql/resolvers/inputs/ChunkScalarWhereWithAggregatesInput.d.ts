import { IntNullableWithAggregatesFilter } from "../inputs/IntNullableWithAggregatesFilter";
import { IntWithAggregatesFilter } from "../inputs/IntWithAggregatesFilter";
import { StringWithAggregatesFilter } from "../inputs/StringWithAggregatesFilter";
export declare class ChunkScalarWhereWithAggregatesInput {
    AND?: ChunkScalarWhereWithAggregatesInput[] | undefined;
    OR?: ChunkScalarWhereWithAggregatesInput[] | undefined;
    NOT?: ChunkScalarWhereWithAggregatesInput[] | undefined;
    id?: IntWithAggregatesFilter | undefined;
    text?: StringWithAggregatesFilter | undefined;
    hash?: StringWithAggregatesFilter | undefined;
    selection?: IntNullableWithAggregatesFilter | undefined;
    fileId?: IntWithAggregatesFilter | undefined;
    modelId?: IntWithAggregatesFilter | undefined;
}
