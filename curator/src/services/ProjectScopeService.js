export const SYSTEM_USER_EMAIL = 'curator@arula.dev';
export const SYSTEM_USER_NAME = 'curator';
export const SYSTEM_PROJECT_ID = 'system';
export const SYSTEM_PROJECT_NAME = 'System';
export async function ensureSystemProject(prisma) {
    if (!prisma?.user?.upsert || !prisma?.project?.upsert)
        return null;
    const systemUser = await prisma.user.upsert({
        where: { email: SYSTEM_USER_EMAIL },
        update: {
            name: SYSTEM_USER_NAME,
        },
        create: {
            email: SYSTEM_USER_EMAIL,
            name: SYSTEM_USER_NAME,
        },
    });
    const systemProject = await prisma.project.upsert({
        where: { id: SYSTEM_PROJECT_ID },
        update: {
            name: SYSTEM_PROJECT_NAME,
            userId: systemUser.id,
            existent: true,
            deletedAt: null,
        },
        create: {
            id: SYSTEM_PROJECT_ID,
            name: SYSTEM_PROJECT_NAME,
            userId: systemUser.id,
            existent: true,
            deletedAt: null,
        },
    });
    return { systemUser, systemProject };
}
export function getReadableProjectIds(activeProjectIds) {
    const ids = new Set([SYSTEM_PROJECT_ID]);
    if (activeProjectIds) {
        if (Array.isArray(activeProjectIds)) {
            activeProjectIds.forEach(id => {
                if (id)
                    ids.add(id);
            });
        }
        else {
            ids.add(activeProjectIds);
        }
    }
    return Array.from(ids);
}
export function buildProjectScopeWhere(activeProjectIds) {
    const ids = getReadableProjectIds(activeProjectIds);
    return {
        OR: [
            { projectId: { in: ids } },
            { projectId: null },
        ],
    };
}
export function getReadableRelationProjectWhere(activeProjectId) {
    return buildProjectScopeWhere(activeProjectId);
}
//# sourceMappingURL=ProjectScopeService.js.map