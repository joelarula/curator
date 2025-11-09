import { ChunkOrderByWithRelationInput } from "../../../inputs/ChunkOrderByWithRelationInput";
import { ChunkWhereInput } from "../../../inputs/ChunkWhereInput";
import { ChunkWhereUniqueInput } from "../../../inputs/ChunkWhereUniqueInput";
export declare class FileDataChunkArgs {
    where?: ChunkWhereInput | undefined;
    orderBy?: ChunkOrderByWithRelationInput[] | undefined;
    cursor?: ChunkWhereUniqueInput | undefined;
    take?: number | undefined;
    skip?: number | undefined;
    distinct?: Array<"id" | "text" | "hash" | "selection" | "fileId" | "modelId"> | undefined;
}
