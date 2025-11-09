import { VectorStoreOrderByWithRelationInput } from "../../../inputs/VectorStoreOrderByWithRelationInput";
import { VectorStoreWhereInput } from "../../../inputs/VectorStoreWhereInput";
import { VectorStoreWhereUniqueInput } from "../../../inputs/VectorStoreWhereUniqueInput";
export declare class FindFirstVectorStoreOrThrowArgs {
    where?: VectorStoreWhereInput | undefined;
    orderBy?: VectorStoreOrderByWithRelationInput[] | undefined;
    cursor?: VectorStoreWhereUniqueInput | undefined;
    take?: number | undefined;
    skip?: number | undefined;
    distinct?: Array<"id" | "namespace" | "content" | "metadata" | "createdAt"> | undefined;
}
