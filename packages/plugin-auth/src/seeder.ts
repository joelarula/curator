import { CURATOR_ROLES } from './types.js';

export interface SeedRbacOptions {
  managers?: string[];
  logger?: { info: (msg: string) => void; warn?: (msg: string) => void; error?: (msg: string) => void };
}

export async function seedCuratorRbac(prisma: any, options?: SeedRbacOptions): Promise<void> {
  if (!prisma) return;
  const logger = options?.logger || console;
  const managers = (options?.managers || ['joel.arula@gmail.com']).map((m) => m.toLowerCase().trim());

  try {
    // 1. Seed Roles
    const rolesToSeed = [
      {
        name: CURATOR_ROLES.MANAGER,
        description: 'Curator Manager with full Console and Agent execution capabilities',
      },
      {
        name: CURATOR_ROLES.ADMIN,
        description: 'Curator System Administrator with full administrative access',
      },
      {
        name: CURATOR_ROLES.USER,
        description: 'Standard authenticated Curator user with read access',
      },
    ];

    const roleMap = new Map<string, any>();
    for (const r of rolesToSeed) {
      try {
        if (prisma.role) {
          const existing = await prisma.role.findFirst({
            where: { OR: [{ id: r.name }, { name: r.name }] },
          });
          if (existing) {
            await prisma.role.update({
              where: { id: existing.id },
              data: { description: r.description },
            });
            roleMap.set(r.name, existing);
          } else {
            const rec = await prisma.role.create({
              data: { id: r.name, name: r.name, description: r.description },
            });
            roleMap.set(r.name, rec);
          }
        }
      } catch (_) {}
    }

    // Direct SQL fallback for role seeding if Prisma upsert was skipped
    try {
      await prisma.$queryRawUnsafe?.(`
        INSERT INTO Role (name, description)
        VALUES ('curator_manager', 'Curator Manager with full Console and Agent capabilities')
        ON DUPLICATE KEY UPDATE description=VALUES(description)
      `);
      await prisma.$queryRawUnsafe?.(`
        INSERT INTO Role (name, description)
        VALUES ('curator_admin', 'Curator System Administrator')
        ON DUPLICATE KEY UPDATE description=VALUES(description)
      `);
      await prisma.$queryRawUnsafe?.(`
        INSERT INTO Role (name, description)
        VALUES ('curator_user', 'Standard authenticated Curator user')
        ON DUPLICATE KEY UPDATE description=VALUES(description)
      `);
    } catch (_) {}

    // 2. Seed Role Inheritance (Composable Roles)
    // curator_manager encompasses curator_admin, and curator_admin encompasses curator_user
    const managerRole = roleMap.get(CURATOR_ROLES.MANAGER) || (await prisma.role?.findUnique?.({ where: { id: CURATOR_ROLES.MANAGER } }));
    const adminRole = roleMap.get(CURATOR_ROLES.ADMIN) || (await prisma.role?.findUnique?.({ where: { name: CURATOR_ROLES.ADMIN } }));
    const userRoleRecord = roleMap.get(CURATOR_ROLES.USER) || (await prisma.role?.findUnique?.({ where: { name: CURATOR_ROLES.USER } }));

    if (managerRole && adminRole && userRoleRecord) {
      const inheritanceToSeed = [
        { parentId: managerRole.id, subRoleId: adminRole.id },
        { parentId: adminRole.id, subRoleId: userRoleRecord.id },
      ];

      for (const inh of inheritanceToSeed) {
        try {
          if (prisma.roleInheritance?.upsert) {
            await prisma.roleInheritance.upsert({
              where: {
                parentId_subRoleId: { parentId: inh.parentId, subRoleId: inh.subRoleId },
              },
              update: {},
              create: inh,
            });
          }
        } catch (_) {}

        try {
          await prisma.$queryRawUnsafe?.(`
            INSERT INTO RoleInheritance (parentId, subRoleId)
            VALUES (${inh.parentId}, ${inh.subRoleId})
            ON DUPLICATE KEY UPDATE parentId=parentId
          `);
        } catch (_) {}
      }
    }

    // 3. Seed Manager Users and Assign Roles
    for (const email of managers) {
      try {
        let user: any = null;
        if (prisma.user?.findUnique) {
          user = await prisma.user.findUnique({ where: { email } });
        }
        if (!user && prisma.user?.create) {
          user = await prisma.user.create({
            data: {
              id: `user_${email.replace(/[^a-zA-Z0-9]/g, '_')}`,
              email,
              name: email.split('@')[0],
            },
          });
        }

        if (user && managerRole && prisma.userRole) {
          const existingUr = await prisma.userRole.findFirst({
            where: { userId: user.id, roleId: managerRole.id, projectId: null },
          });
          if (!existingUr) {
            await prisma.userRole.create({
              data: { userId: user.id, roleId: managerRole.id, projectId: null },
            });
          }
        }
      } catch (_) {}
    }

    logger.info?.(`Curator RBAC seeded successfully with composable roles (managers: ${managers.join(', ')})`);
  } catch (err: any) {
    logger.warn?.(`Curator RBAC seeding notice: ${err?.message || err}`);
  }
}
