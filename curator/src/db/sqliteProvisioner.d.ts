import type { PrismaClient } from '@prisma/client';
export declare function provisionSqliteDb(name: string, forceReset?: boolean, options?: {
    databasePath?: string;
}): Promise<PrismaClient>;
//# sourceMappingURL=sqliteProvisioner.d.ts.map