import { Prisma } from "@prisma/client";
export declare class DocumentCreateInput {
    id?: string | undefined;
    content: string;
    metadata?: Prisma.InputJsonValue | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
}
