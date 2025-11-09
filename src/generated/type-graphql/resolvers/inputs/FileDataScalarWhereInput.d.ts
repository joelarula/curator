import { BytesNullableFilter } from "../inputs/BytesNullableFilter";
import { DateTimeFilter } from "../inputs/DateTimeFilter";
import { IntFilter } from "../inputs/IntFilter";
import { StringFilter } from "../inputs/StringFilter";
import { StringNullableFilter } from "../inputs/StringNullableFilter";
export declare class FileDataScalarWhereInput {
    AND?: FileDataScalarWhereInput[] | undefined;
    OR?: FileDataScalarWhereInput[] | undefined;
    NOT?: FileDataScalarWhereInput[] | undefined;
    id?: IntFilter | undefined;
    name?: StringFilter | undefined;
    mimeType?: StringFilter | undefined;
    source?: StringNullableFilter | undefined;
    hash?: StringFilter | undefined;
    size?: IntFilter | undefined;
    content?: BytesNullableFilter | undefined;
    projectId?: IntFilter | undefined;
    createdAt?: DateTimeFilter | undefined;
    updatedAt?: DateTimeFilter | undefined;
}
