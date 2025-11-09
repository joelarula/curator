import { IntWithAggregatesFilter } from "../inputs/IntWithAggregatesFilter";
import { StringNullableWithAggregatesFilter } from "../inputs/StringNullableWithAggregatesFilter";
import { StringWithAggregatesFilter } from "../inputs/StringWithAggregatesFilter";
export declare class ModelScalarWhereWithAggregatesInput {
    AND?: ModelScalarWhereWithAggregatesInput[] | undefined;
    OR?: ModelScalarWhereWithAggregatesInput[] | undefined;
    NOT?: ModelScalarWhereWithAggregatesInput[] | undefined;
    id?: IntWithAggregatesFilter | undefined;
    name?: StringWithAggregatesFilter | undefined;
    columnName?: StringWithAggregatesFilter | undefined;
    source?: StringNullableWithAggregatesFilter | undefined;
}
