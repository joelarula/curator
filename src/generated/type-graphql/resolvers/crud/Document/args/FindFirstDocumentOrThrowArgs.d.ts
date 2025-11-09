import { DocumentOrderByWithRelationInput } from "../../../inputs/DocumentOrderByWithRelationInput";
import { DocumentWhereInput } from "../../../inputs/DocumentWhereInput";
import { DocumentWhereUniqueInput } from "../../../inputs/DocumentWhereUniqueInput";
export declare class FindFirstDocumentOrThrowArgs {
    where?: DocumentWhereInput | undefined;
    orderBy?: DocumentOrderByWithRelationInput[] | undefined;
    cursor?: DocumentWhereUniqueInput | undefined;
    take?: number | undefined;
    skip?: number | undefined;
    distinct?: Array<"id" | "content" | "metadata" | "createdAt" | "updatedAt"> | undefined;
}
