import { FileDataOrderByWithRelationInput } from "../../../inputs/FileDataOrderByWithRelationInput";
import { FileDataWhereInput } from "../../../inputs/FileDataWhereInput";
import { FileDataWhereUniqueInput } from "../../../inputs/FileDataWhereUniqueInput";
export declare class ProjectFilesArgs {
    where?: FileDataWhereInput | undefined;
    orderBy?: FileDataOrderByWithRelationInput[] | undefined;
    cursor?: FileDataWhereUniqueInput | undefined;
    take?: number | undefined;
    skip?: number | undefined;
    distinct?: Array<"id" | "name" | "mimeType" | "source" | "hash" | "size" | "content" | "projectId" | "createdAt" | "updatedAt"> | undefined;
}
