import { Prisma } from "@prisma/client";
import { DocumentCountAggregate } from "../outputs/DocumentCountAggregate";
import { DocumentMaxAggregate } from "../outputs/DocumentMaxAggregate";
import { DocumentMinAggregate } from "../outputs/DocumentMinAggregate";
export declare class DocumentGroupBy {
    id: string;
    content: string;
    metadata: Prisma.JsonValue | null;
    createdAt: Date;
    updatedAt: Date;
    _count: DocumentCountAggregate | null;
    _min: DocumentMinAggregate | null;
    _max: DocumentMaxAggregate | null;
}
