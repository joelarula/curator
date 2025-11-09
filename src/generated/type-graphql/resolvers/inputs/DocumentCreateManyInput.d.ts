import { Prisma } from "@prisma/client";
export declare class DocumentCreateManyInput {
    id?: string | undefined;
    content: string;
    metadata?: Prisma.InputJsonValue | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
}
