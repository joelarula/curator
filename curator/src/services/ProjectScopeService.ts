import type { PrismaClient } from '@prisma/client';

export const SYSTEM_USER_EMAIL = 'curator@arula.dev';
export const SYSTEM_USER_NAME = 'curator';
export const SYSTEM_PROJECT_ID = 'system';
export const SYSTEM_PROJECT_NAME = 'System';

export async function ensureSystemProject(prisma: PrismaClient | any) {
  if (!prisma?.user?.upsert || !prisma?.project?.upsert) return null;
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

/**
 * Whether a caller with `activeProjectIds` may read an entity of `projectId`: its own projects plus 'system'. Entities
 * without a project belong to unscoped sessions: only a caller without an active project sees them.
 */
export function canReadProject(projectId: string | null | undefined, activeProjectIds: string[]): boolean {
  const active = activeProjectIds.filter(Boolean);
  if (projectId == null) return active.length === 0;
  return getReadableProjectIds(active).includes(projectId);
}

export function getReadableProjectIds(activeProjectIds?: string | string[] | null) {
  const ids = new Set<string>([SYSTEM_PROJECT_ID]);
  if (activeProjectIds) {
    if (Array.isArray(activeProjectIds)) {
      activeProjectIds.forEach(id => {
        if (id) ids.add(id);
      });
    } else {
      ids.add(activeProjectIds);
    }
  }
  return Array.from(ids);
}

export function buildProjectScopeWhere(activeProjectIds?: string | string[] | null) {
  const ids = getReadableProjectIds(activeProjectIds);
  return {
    OR: [
      { projectId: { in: ids } },
      { projectId: null },
    ],
  };
}

export function getReadableRelationProjectWhere(activeProjectId?: string | null) {
  return buildProjectScopeWhere(activeProjectId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Project hierarchy (Project.parentId): a workspace project may have sub-projects.
// Agents defined in a project may act in its sub-projects; management tools write only inside the
// actor's workspace subtree. Walks are bounded so a corrupted parent chain can never loop.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_PROJECT_DEPTH = 32;

/** Ancestor ids of an active project, nearest first (excluding the project itself). Returns empty if the project or any ancestor is soft-deleted. */
export async function getProjectAncestorIds(prisma: PrismaClient | any, projectId: string | null | undefined): Promise<string[]> {
  const ancestors: string[] = [];
  if (!projectId || !prisma?.project?.findUnique) return ancestors;
  let current: string | null = String(projectId);
  try {
    for (let i = 0; i < MAX_PROJECT_DEPTH && current; i++) {
      const row: { parentId?: string | null; existent?: boolean | null; deletedAt?: Date | null } | null = await prisma.project.findUnique({
        where: { id: current },
        select: { parentId: true, existent: true, deletedAt: true },
      });
      // If the project or any ancestor has been soft-deleted, break the active chain
      if (!row || row.existent === false || row.deletedAt != null) {
        return [];
      }
      const parent: string | null = row?.parentId ?? null;
      if (!parent || parent === projectId || ancestors.includes(parent)) break;
      ancestors.push(parent);
      current = parent;
    }
  } catch {
    // Schema without Project.parentId: no hierarchy.
  }
  return ancestors;
}

/** True when `candidateId` is `rootId` itself or one of its active (transitive) sub-projects. */
export async function isProjectWithin(prisma: PrismaClient | any, candidateId: string | null | undefined, rootId: string | null | undefined): Promise<boolean> {
  if (!candidateId || !rootId) return false;
  if (String(candidateId) === String(rootId)) {
    if (prisma?.project?.findUnique) {
      const p = await prisma.project.findUnique({ where: { id: String(rootId) }, select: { existent: true, deletedAt: true } });
      return !!p && p.existent !== false && p.deletedAt == null;
    }
    return true;
  }
  return (await getProjectAncestorIds(prisma, candidateId)).includes(String(rootId));
}

/** `rootId` and all its (transitive, active/existing) sub-projects. Returns empty if rootId itself is deleted. */
export async function getProjectSubtreeIds(prisma: PrismaClient | any, rootId: string | null | undefined): Promise<string[]> {
  if (!rootId) return [];
  const rootStr = String(rootId);
  if (!prisma?.project?.findMany) return [rootStr];
  try {
    const root = await prisma.project.findUnique({
      where: { id: rootStr },
      select: { id: true, existent: true, deletedAt: true },
    });
    if (!root || root.existent === false || root.deletedAt != null) {
      return [];
    }
    const ids = [rootStr];
    let frontier = [rootStr];
    for (let depth = 0; depth < MAX_PROJECT_DEPTH && frontier.length > 0; depth++) {
      const children: { id: string }[] = await prisma.project.findMany({
        where: { parentId: { in: frontier }, existent: true, deletedAt: null },
        select: { id: true },
      });
      frontier = children.map((c) => c.id).filter((id) => !ids.includes(id));
      ids.push(...frontier);
    }
    return ids;
  } catch {
    // Schema without Project.parentId: the subtree is the project itself.
    return [rootStr];
  }
}
