import { CURATOR_ROLES, seedCuratorRbac } from '@curator/plugin-auth';
import { GalleryConstant, GalleryRole } from '../models/index.ts';

export interface ProjectEmailMapping {
  projectId: string;
  name: string;
  emails: string[];
  roles: string[];
}

export interface UserProjectAccessDTO {
  id: string;
  name: string;
  roles: string[];
}

export interface SeedProjectEmailsResult {
  projectsSeeded: string[];
  usersSeeded: string[];
  rolesAssigned: number;
  mappings: Record<string, ProjectEmailMapping>;
}

/**
 * Normalizes project-to-email configuration from `gallery.config.yaml` (`appConfig.values`).
 * Supports:
 * - `projects: { artmoments: ["a@b.com"] }`
 * - `projects: { artmoments: { name: "Artmoments", emails: ["a@b.com"], roles: [...] } }`
 * - `auth.projectEmails: { ... }`
 */
export function resolveProjectEmailMappings(
  configValues: Record<string, any> = {},
  explicitMappings?: Record<string, any>
): Record<string, ProjectEmailMapping> {
  const rawSources = [
    configValues?.values?.auth?.projectEmails,
    configValues?.values?.projects,
    configValues?.auth?.projectEmails,
    configValues?.projects,
    configValues?.projectEmails,
    explicitMappings,
  ].filter((s) => s && typeof s === 'object');

  const merged: Record<string, ProjectEmailMapping> = {};

  for (const src of rawSources) {
    for (const [rawProjectId, rawEntry] of Object.entries<any>(src)) {
      const projectId = String(rawProjectId || '').trim();
      if (!projectId) continue;

      const existing = merged[projectId];
      let emails: string[] = [];
      let name =
        existing?.name ||
        (projectId === GalleryConstant.DEFAULT_PROJECT_ID
          ? GalleryConstant.DEFAULT_PROJECT_NAME
          : projectId);
      let roles: string[] = existing?.roles || [
        CURATOR_ROLES.MANAGER,
        GalleryRole.ADMIN,
        GalleryRole.CURATOR,
      ];

      if (Array.isArray(rawEntry)) {
        emails = rawEntry.map((e) => String(e).toLowerCase().trim()).filter(Boolean);
      } else if (typeof rawEntry === 'string') {
        emails = rawEntry
          .split(',')
          .map((e) => e.toLowerCase().trim())
          .filter(Boolean);
      } else if (rawEntry && typeof rawEntry === 'object') {
        if (rawEntry.name) name = String(rawEntry.name).trim();
        if (Array.isArray(rawEntry.emails)) {
          emails = rawEntry.emails.map((e: any) => String(e).toLowerCase().trim()).filter(Boolean);
        } else if (typeof rawEntry.email === 'string') {
          emails = [rawEntry.email.toLowerCase().trim()];
        }
        if (Array.isArray(rawEntry.roles) && rawEntry.roles.length > 0) {
          roles = rawEntry.roles.map((r: any) => String(r).trim()).filter(Boolean);
        }
      }

      const combinedEmails = Array.from(new Set([...(existing?.emails || []), ...emails]));
      merged[projectId] = {
        projectId,
        name,
        emails: combinedEmails,
        roles: Array.from(new Set(roles)),
      };
    }
  }

  // Ensure default project always has a mapping entry
  if (!merged[GalleryConstant.DEFAULT_PROJECT_ID]) {
    const defaultManagers: string[] = Array.isArray(configValues?.auth?.defaultManagers)
      ? configValues.auth.defaultManagers
      : ['joel.arula@gmail.com', 'mailbox@artmoments.ee'];
    merged[GalleryConstant.DEFAULT_PROJECT_ID] = {
      projectId: GalleryConstant.DEFAULT_PROJECT_ID,
      name: GalleryConstant.DEFAULT_PROJECT_NAME,
      emails: defaultManagers.map((e) => String(e).toLowerCase().trim()).filter(Boolean),
      roles: [CURATOR_ROLES.MANAGER, GalleryRole.ADMIN, GalleryRole.CURATOR],
    };
  }

  return merged;
}

/**
 * Collects all unique manager/admin emails across `auth.defaultManagers` and `projects` mappings.
 */
export function collectAllConfiguredEmails(
  configValues: Record<string, any> = {},
  mappings?: Record<string, ProjectEmailMapping>
): string[] {
  const resolved = mappings || resolveProjectEmailMappings(configValues);
  const emails = new Set<string>(['joel.arula@gmail.com']);

  const rawManagers =
    configValues?.auth?.defaultManagers || configValues?.values?.auth?.defaultManagers;
  if (Array.isArray(rawManagers)) {
    for (const e of rawManagers) {
      const clean = String(e || '').toLowerCase().trim();
      if (clean) emails.add(clean);
    }
  }

  for (const proj of Object.values(resolved)) {
    for (const e of proj.emails) {
      if (e) emails.add(e.toLowerCase().trim());
    }
  }

  return Array.from(emails);
}

/**
 * Seeds Project-to-Email mappings from `gallery.config.yaml` into the Curator Core DB:
 * 1. Seeds standard Curator RBAC roles (`curator_manager`, `curator_admin`, `curator_user`) & gallery roles (`gallery_admin`, `gallery_curator`, `gallery_viewer`).
 * 2. Seeds `RoleInheritance` (`curator_manager` -> `gallery_admin` -> `gallery_curator` -> `gallery_viewer`).
 * 3. Upserts `User` rows for every email configured in `gallery.config.yaml`.
 * 4. Upserts `Project` rows and assigns primary owner `userId`.
 * 5. Upserts `ProjectRole` and `UserRole` (both project-scoped `projectId` and global `null`) for each email in the project.
 */
export async function seedProjectEmailMappings(
  prisma: any,
  options: {
    configValues?: Record<string, any>;
    mappings?: Record<string, any>;
    quiet?: boolean;
  } = {}
): Promise<SeedProjectEmailsResult> {
  const mappings = resolveProjectEmailMappings(options.configValues, options.mappings);
  const allEmails = collectAllConfiguredEmails(options.configValues, mappings);

  if (!prisma) {
    return {
      projectsSeeded: [],
      usersSeeded: [],
      rolesAssigned: 0,
      mappings,
    };
  }

  // 1. Seed base Curator RBAC via @curator/plugin-auth
  await seedCuratorRbac(prisma, {
    managers: allEmails,
    logger: options.quiet
      ? { info: () => {}, warn: () => {}, error: console.error }
      : undefined,
  });

  // 2. Ensure gallery roles and RoleInheritance exist
  const galleryRoleDefs = [
    {
      id: GalleryRole.ADMIN,
      name: GalleryRole.ADMIN,
      description: 'Gallery Administrator with full project, migration, and catalog privileges',
    },
    {
      id: GalleryRole.CURATOR,
      name: GalleryRole.CURATOR,
      description: 'Gallery Curator authorized to upload and manage artworks and categories',
    },
    {
      id: GalleryRole.VIEWER,
      name: GalleryRole.VIEWER,
      description: 'Public Gallery Viewer',
    },
  ];

  for (const r of galleryRoleDefs) {
    try {
      await prisma.role.upsert({
        where: { id: r.id },
        update: { name: r.name, description: r.description },
        create: { id: r.id, name: r.name, description: r.description },
      });
    } catch {}
  }

  const inheritances = [
    { parentId: CURATOR_ROLES.MANAGER, subRoleId: GalleryRole.ADMIN },
    { parentId: GalleryRole.ADMIN, subRoleId: GalleryRole.CURATOR },
    { parentId: GalleryRole.CURATOR, subRoleId: GalleryRole.VIEWER },
  ];
  for (const inh of inheritances) {
    try {
      await prisma.roleInheritance.upsert({
        where: { parentId_subRoleId: inh },
        update: {},
        create: inh,
      });
    } catch {}
  }

  const projectsSeeded: string[] = [];
  const usersSeeded = new Set<string>();
  let rolesAssigned = 0;

  // 3. Seed each Project and its mapped User emails + UserRoles
  for (const mapping of Object.values(mappings)) {
    const { projectId, name: projectName, emails, roles } = mapping;
    const projectUsers: any[] = [];

    for (const rawEmail of emails) {
      const email = rawEmail.toLowerCase().trim();
      if (!email) continue;

      const userId = `user_${email.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const displayName = email.split('@')[0];

      let user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        user = await prisma.user.create({
          data: {
            id: userId,
            email,
            name: displayName,
          },
        });
      }
      usersSeeded.add(email);
      projectUsers.push(user);
    }

    const ownerUserId = projectUsers[0]?.id || 'system';

    await prisma.project.upsert({
      where: { id: projectId },
      update: {
        name: projectName,
        existent: true,
      },
      create: {
        id: projectId,
        name: projectName,
        userId: ownerUserId,
        existent: true,
      },
    });
    projectsSeeded.push(projectId);

    // Link roles to project via ProjectRole
    for (const roleName of roles) {
      const roleRec = await prisma.role.findFirst({
        where: { OR: [{ id: roleName }, { name: roleName }] },
      });
      if (!roleRec) continue;

      if (prisma.projectRole) {
        const existingPr = await prisma.projectRole.findFirst({
          where: { projectId, roleId: roleRec.id },
        });
        if (!existingPr) {
          await prisma.projectRole.create({
            data: { projectId, roleId: roleRec.id },
          });
        }
      }

      // Assign UserRole to each mapped user for this project (both project-scoped and global)
      for (const user of projectUsers) {
        const existingScoped = await prisma.userRole.findFirst({
          where: {
            userId: user.id,
            roleId: roleRec.id,
            projectId,
          },
        });
        if (!existingScoped) {
          await prisma.userRole.create({
            data: {
              userId: user.id,
              roleId: roleRec.id,
              projectId,
            },
          });
          rolesAssigned++;
        } else if (existingScoped.deletedAt) {
          await prisma.userRole.update({
            where: { id: existingScoped.id },
            data: { deletedAt: null },
          });
        }

        const existingGlobal = await prisma.userRole.findFirst({
          where: {
            userId: user.id,
            roleId: roleRec.id,
            projectId: null,
          },
        });
        if (!existingGlobal) {
          await prisma.userRole.create({
            data: {
              userId: user.id,
              roleId: roleRec.id,
              projectId: null,
            },
          });
        }
      }
    }
  }

  if (!options.quiet) {
    console.log(
      `\x1b[36m[Gallery Auth Seeder]\x1b[0m Seeded project-to-email RBAC for projects [\x1b[32m${projectsSeeded.join(', ')}\x1b[0m] and emails [\x1b[33m${Array.from(usersSeeded).join(', ')}\x1b[0m]`
    );
  }

  return {
    projectsSeeded,
    usersSeeded: Array.from(usersSeeded),
    rolesAssigned,
    mappings,
  };
}

/**
 * Resolves all gallery projects a user (by userId and/or email) has access to,
 * combining database `UserRole` / `Project` records with `gallery.config.yaml` mappings.
 */
export async function resolveUserProjects(
  prisma: any,
  user: { id?: string; email?: string | null } | null | undefined,
  mappings: Record<string, ProjectEmailMapping> = {}
): Promise<UserProjectAccessDTO[]> {
  if (!user) return [];
  const email = (user.email || '').toLowerCase().trim();
  const projectMap = new Map<string, { id: string; name: string; roles: Set<string> }>();

  // 1. Check YAML project-to-email mappings
  for (const mapping of Object.values(mappings)) {
    if (email && mapping.emails.includes(email)) {
      projectMap.set(mapping.projectId, {
        id: mapping.projectId,
        name: mapping.name,
        roles: new Set(mapping.roles),
      });
    }
  }

  // 2. Check database UserRole & Project tables
  if (prisma) {
    try {
      let dbUser = null;
      if (user.id) {
        dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      }
      if (!dbUser && email) {
        dbUser = await prisma.user.findUnique({ where: { email } });
      }

      if (dbUser) {
        const scopedRoles = await prisma.userRole.findMany({
          where: {
            userId: dbUser.id,
            deletedAt: null,
            projectId: { not: null },
          },
          include: {
            role: true,
            project: true,
          },
        });

        for (const ur of scopedRoles) {
          const pid = ur.projectId;
          if (!pid || pid === '1' || pid === 'system') continue;
          const pName = ur.project?.name || mappings[pid]?.name || pid;
          const entry = projectMap.get(pid) || {
            id: pid,
            name: pName,
            roles: new Set<string>(),
          };
          const roleName = ur.role?.name || ur.roleId;
          if (roleName) entry.roles.add(roleName);
          projectMap.set(pid, entry);
        }

        const ownedProjects = await prisma.project.findMany({
          where: { userId: dbUser.id, existent: true },
        });
        for (const p of ownedProjects) {
          if (p.id === '1' || p.id === 'system') continue;
          const entry = projectMap.get(p.id) || {
            id: p.id,
            name: p.name,
            roles: new Set<string>([CURATOR_ROLES.MANAGER, GalleryRole.ADMIN]),
          };
          projectMap.set(p.id, entry);
        }
      }
    } catch {}
  }

  return Array.from(projectMap.values()).map((p) => ({
    id: p.id,
    name: p.name,
    roles: Array.from(p.roles),
  }));
}
