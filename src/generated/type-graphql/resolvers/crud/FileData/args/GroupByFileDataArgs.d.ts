import { FileDataOrderByWithAggregationInput } from "../../../inputs/FileDataOrderByWithAggregationInput";
import { FileDataScalarWhereWithAggregatesInput } from "../../../inputs/FileDataScalarWhereWithAggregatesInput";
import { FileDataWhereInput } from "../../../inputs/FileDataWhereInput";
export declare class GroupByFileDataArgs {
    where?: FileDataWhereInput | undefined;
    orderBy?: FileDataOrderByWithAggregationInput[] | undefined;
    by: Array<"id" | "name" | "mimeType" | "source" | "hash" | "size" | "content" | "projectId" | "createdAt" | "updatedAt">;
    having?: FileDataScalarWhereWithAggregatesInput | undefined;
    take?: number | undefined;
    skip?: number | undefined;
}
