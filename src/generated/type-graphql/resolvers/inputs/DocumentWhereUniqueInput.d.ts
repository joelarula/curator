import { DateTimeFilter } from "../inputs/DateTimeFilter";
import { DocumentWhereInput } from "../inputs/DocumentWhereInput";
import { JsonNullableFilter } from "../inputs/JsonNullableFilter";
import { StringFilter } from "../inputs/StringFilter";
export declare class DocumentWhereUniqueInput {
    id?: string | undefined;
    AND?: DocumentWhereInput[] | undefined;
    OR?: DocumentWhereInput[] | undefined;
    NOT?: DocumentWhereInput[] | undefined;
    content?: StringFilter | undefined;
    metadata?: JsonNullableFilter | undefined;
    createdAt?: DateTimeFilter | undefined;
    updatedAt?: DateTimeFilter | undefined;
}
