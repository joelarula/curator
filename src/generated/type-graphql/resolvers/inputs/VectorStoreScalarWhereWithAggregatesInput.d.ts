import { DateTimeWithAggregatesFilter } from "../inputs/DateTimeWithAggregatesFilter";
import { JsonNullableWithAggregatesFilter } from "../inputs/JsonNullableWithAggregatesFilter";
import { StringWithAggregatesFilter } from "../inputs/StringWithAggregatesFilter";
export declare class VectorStoreScalarWhereWithAggregatesInput {
    AND?: VectorStoreScalarWhereWithAggregatesInput[] | undefined;
    OR?: VectorStoreScalarWhereWithAggregatesInput[] | undefined;
    NOT?: VectorStoreScalarWhereWithAggregatesInput[] | undefined;
    id?: StringWithAggregatesFilter | undefined;
    namespace?: StringWithAggregatesFilter | undefined;
    content?: StringWithAggregatesFilter | undefined;
    metadata?: JsonNullableWithAggregatesFilter | undefined;
    createdAt?: DateTimeWithAggregatesFilter | undefined;
}
