import { DateTimeFilter } from "../inputs/DateTimeFilter";
import { JsonNullableFilter } from "../inputs/JsonNullableFilter";
import { StringFilter } from "../inputs/StringFilter";
import { VectorStoreWhereInput } from "../inputs/VectorStoreWhereInput";
export declare class VectorStoreWhereUniqueInput {
    id?: string | undefined;
    AND?: VectorStoreWhereInput[] | undefined;
    OR?: VectorStoreWhereInput[] | undefined;
    NOT?: VectorStoreWhereInput[] | undefined;
    namespace?: StringFilter | undefined;
    content?: StringFilter | undefined;
    metadata?: JsonNullableFilter | undefined;
    createdAt?: DateTimeFilter | undefined;
}
