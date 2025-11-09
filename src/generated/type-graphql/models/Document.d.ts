import { Prisma } from "@prisma/client";
export declare class Document {
    id: string;
    content: string;
    metadata?: Prisma.JsonValue | null;
    createdAt: Date;
    updatedAt: Date;
}
