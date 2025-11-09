import { DateTimeFilter } from "../inputs/DateTimeFilter";
import { JsonNullableFilter } from "../inputs/JsonNullableFilter";
import { StringFilter } from "../inputs/StringFilter";
export declare class VectorStoreWhereInput {
    AND?: VectorStoreWhereInput[] | undefined;
    OR?: VectorStoreWhereInput[] | undefined;
    NOT?: VectorStoreWhereInput[] | undefined;
    id?: StringFilter | undefined;
    namespace?: StringFilter | undefined;
    content?: StringFilter | undefined;
    metadata?: JsonNullableFilter | undefined;
    createdAt?: DateTimeFilter | undefined;
}
