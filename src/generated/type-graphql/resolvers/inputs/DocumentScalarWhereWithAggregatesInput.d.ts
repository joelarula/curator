import { DateTimeWithAggregatesFilter } from "../inputs/DateTimeWithAggregatesFilter";
import { JsonNullableWithAggregatesFilter } from "../inputs/JsonNullableWithAggregatesFilter";
import { StringWithAggregatesFilter } from "../inputs/StringWithAggregatesFilter";
export declare class DocumentScalarWhereWithAggregatesInput {
    AND?: DocumentScalarWhereWithAggregatesInput[] | undefined;
    OR?: DocumentScalarWhereWithAggregatesInput[] | undefined;
    NOT?: DocumentScalarWhereWithAggregatesInput[] | undefined;
    id?: StringWithAggregatesFilter | undefined;
    content?: StringWithAggregatesFilter | undefined;
    metadata?: JsonNullableWithAggregatesFilter | undefined;
    createdAt?: DateTimeWithAggregatesFilter | undefined;
    updatedAt?: DateTimeWithAggregatesFilter | undefined;
}
