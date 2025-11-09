import { DateTimeFilter } from "../inputs/DateTimeFilter";
import { JsonNullableFilter } from "../inputs/JsonNullableFilter";
import { StringFilter } from "../inputs/StringFilter";
export declare class DocumentWhereInput {
    AND?: DocumentWhereInput[] | undefined;
    OR?: DocumentWhereInput[] | undefined;
    NOT?: DocumentWhereInput[] | undefined;
    id?: StringFilter | undefined;
    content?: StringFilter | undefined;
    metadata?: JsonNullableFilter | undefined;
    createdAt?: DateTimeFilter | undefined;
    updatedAt?: DateTimeFilter | undefined;
}
