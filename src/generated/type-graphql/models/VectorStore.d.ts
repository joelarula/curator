import { Prisma } from "@prisma/client";
export declare class VectorStore {
    id: string;
    namespace: string;
    content: string;
    metadata?: Prisma.JsonValue | null;
    createdAt: Date;
}
