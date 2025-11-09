import { Prisma } from "@prisma/client";
import { VectorStoreCountAggregate } from "../outputs/VectorStoreCountAggregate";
import { VectorStoreMaxAggregate } from "../outputs/VectorStoreMaxAggregate";
import { VectorStoreMinAggregate } from "../outputs/VectorStoreMinAggregate";
export declare class VectorStoreGroupBy {
    id: string;
    namespace: string;
    content: string;
    metadata: Prisma.JsonValue | null;
    createdAt: Date;
    _count: VectorStoreCountAggregate | null;
    _min: VectorStoreMinAggregate | null;
    _max: VectorStoreMaxAggregate | null;
}
