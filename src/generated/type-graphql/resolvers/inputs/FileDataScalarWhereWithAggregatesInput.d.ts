import { BytesNullableWithAggregatesFilter } from "../inputs/BytesNullableWithAggregatesFilter";
import { DateTimeWithAggregatesFilter } from "../inputs/DateTimeWithAggregatesFilter";
import { IntWithAggregatesFilter } from "../inputs/IntWithAggregatesFilter";
import { StringNullableWithAggregatesFilter } from "../inputs/StringNullableWithAggregatesFilter";
import { StringWithAggregatesFilter } from "../inputs/StringWithAggregatesFilter";
export declare class FileDataScalarWhereWithAggregatesInput {
    AND?: FileDataScalarWhereWithAggregatesInput[] | undefined;
    OR?: FileDataScalarWhereWithAggregatesInput[] | undefined;
    NOT?: FileDataScalarWhereWithAggregatesInput[] | undefined;
    id?: IntWithAggregatesFilter | undefined;
    name?: StringWithAggregatesFilter | undefined;
    mimeType?: StringWithAggregatesFilter | undefined;
    source?: StringNullableWithAggregatesFilter | undefined;
    hash?: StringWithAggregatesFilter | undefined;
    size?: IntWithAggregatesFilter | undefined;
    content?: BytesNullableWithAggregatesFilter | undefined;
    projectId?: IntWithAggregatesFilter | undefined;
    createdAt?: DateTimeWithAggregatesFilter | undefined;
    updatedAt?: DateTimeWithAggregatesFilter | undefined;
}
