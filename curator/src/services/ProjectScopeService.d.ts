import type { PrismaClient } from '@prisma/client';
export declare const SYSTEM_USER_EMAIL = "curator@arula.dev";
export declare const SYSTEM_USER_NAME = "curator";
export declare const SYSTEM_PROJECT_ID = "system";
export declare const SYSTEM_PROJECT_NAME = "System";
export declare function ensureSystemProject(prisma: PrismaClient | any): Promise<{
    systemUser: any;
    systemProject: any;
} | null>;
export declare function getReadableProjectIds(activeProjectIds?: string | string[] | null): string[];
export declare function buildProjectScopeWhere(activeProjectIds?: string | string[] | null): {
    OR: ({
        projectId: {
            in: string[];
        };
    } | {
        projectId: null;
    })[];
};
export declare function getReadableRelationProjectWhere(activeProjectId?: string | null): {
    OR: ({
        projectId: {
            in: string[];
        };
    } | {
        projectId: null;
    })[];
};
//# sourceMappingURL=ProjectScopeService.d.ts.map