import { Prisma } from "@prisma/client";
export declare class CreateManyAndReturnDocument {
    id: string;
    content: string;
    metadata: Prisma.JsonValue | null;
    createdAt: Date;
    updatedAt: Date;
}
