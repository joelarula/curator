import { ChunkOrderByWithAggregationInput } from "../../../inputs/ChunkOrderByWithAggregationInput";
import { ChunkScalarWhereWithAggregatesInput } from "../../../inputs/ChunkScalarWhereWithAggregatesInput";
import { ChunkWhereInput } from "../../../inputs/ChunkWhereInput";
export declare class GroupByChunkArgs {
    where?: ChunkWhereInput | undefined;
    orderBy?: ChunkOrderByWithAggregationInput[] | undefined;
    by: Array<"id" | "text" | "hash" | "selection" | "fileId" | "modelId">;
    having?: ChunkScalarWhereWithAggregatesInput | undefined;
    take?: number | undefined;
    skip?: number | undefined;
}
