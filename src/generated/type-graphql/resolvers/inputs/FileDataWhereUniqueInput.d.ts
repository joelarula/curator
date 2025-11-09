import { BytesNullableFilter } from "../inputs/BytesNullableFilter";
import { ChunkListRelationFilter } from "../inputs/ChunkListRelationFilter";
import { DateTimeFilter } from "../inputs/DateTimeFilter";
import { FileDataNameProjectIdCompoundUniqueInput } from "../inputs/FileDataNameProjectIdCompoundUniqueInput";
import { FileDataWhereInput } from "../inputs/FileDataWhereInput";
import { IntFilter } from "../inputs/IntFilter";
import { ProjectRelationFilter } from "../inputs/ProjectRelationFilter";
import { StringFilter } from "../inputs/StringFilter";
import { StringNullableFilter } from "../inputs/StringNullableFilter";
export declare class FileDataWhereUniqueInput {
    id?: number | undefined;
    name_projectId?: FileDataNameProjectIdCompoundUniqueInput | undefined;
    AND?: FileDataWhereInput[] | undefined;
    OR?: FileDataWhereInput[] | undefined;
    NOT?: FileDataWhereInput[] | undefined;
    name?: StringFilter | undefined;
    mimeType?: StringFilter | undefined;
    source?: StringNullableFilter | undefined;
    hash?: StringFilter | undefined;
    size?: IntFilter | undefined;
    content?: BytesNullableFilter | undefined;
    projectId?: IntFilter | undefined;
    createdAt?: DateTimeFilter | undefined;
    updatedAt?: DateTimeFilter | undefined;
    project?: ProjectRelationFilter | undefined;
    Chunk?: ChunkListRelationFilter | undefined;
}
