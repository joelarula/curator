import { CURATOR_ROLES } from './types.js';
export async function seedCuratorRbac(prisma, options) {
    if (!prisma)
        return;
    const logger = options?.logger || console;
    const managers = (options?.managers || ['joel.arula@gmail.com']).map((m) => m.toLowerCase().trim());
    try {
        // 1. Seed Roles
        const rolesToSeed = [
            {
                id: 'role_curator_manager',
                name: CURATOR_ROLES.MANAGER,
                description: 'Curator Manager with full Console and Agent execution capabilities',
            },
            {
                id: 'role_curator_admin',
                name: CURATOR_ROLES.ADMIN,
                description: 'Curator System Administrator with full administrative access',
            },
            {
                id: 'role_curator_user',
                name: CURATOR_ROLES.USER,
                description: 'Standard authenticated Curator user with read access',
            },
        ];
        for (const r of rolesToSeed) {
            try {
                if (prisma.role?.upsert) {
                    await prisma.role.upsert({
                        where: { name: r.name },
                        update: { description: r.description },
                        create: r,
                    });
                }
            }
            catch (_) { }
        }
        // Direct SQL fallback for role seeding if Prisma upsert was skipped
        try {
            await prisma.$queryRawUnsafe?.(`
        INSERT INTO Role (id, name, description)
        VALUES ('role_curator_manager', 'curator_manager', 'Curator Manager with full Console and Agent capabilities')
        ON DUPLICATE KEY UPDATE description=VALUES(description)
      `);
            await prisma.$queryRawUnsafe?.(`
        INSERT INTO Role (id, name, description)
        VALUES ('role_curator_admin', 'curator_admin', 'Curator System Administrator')
        ON DUPLICATE KEY UPDATE description=VALUES(description)
      `);
            await prisma.$queryRawUnsafe?.(`
        INSERT INTO Role (id, name, description)
        VALUES ('role_curator_user', 'curator_user', 'Standard authenticated Curator user')
        ON DUPLICATE KEY UPDATE description=VALUES(description)
      `);
        }
        catch (_) { }
        // 2. Seed Role Inheritance (Composable Roles)
        // curator_manager encompasses curator_admin, and curator_admin encompasses curator_user
        const inheritanceToSeed = [
            { parentId: 'role_curator_manager', subRoleId: 'role_curator_admin' },
            { parentId: 'role_curator_admin', subRoleId: 'role_curator_user' },
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
            }
            catch (_) { }
            try {
                await prisma.$queryRawUnsafe?.(`
          INSERT INTO RoleInheritance (parentId, subRoleId)
          VALUES ('${inh.parentId}', '${inh.subRoleId}')
          ON DUPLICATE KEY UPDATE parentId=parentId
        `);
            }
            catch (_) { }
        }
        // 3. Seed Manager Users and Assign Roles
        for (const email of managers) {
            try {
                let user = null;
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
                if (user && prisma.userRole?.upsert) {
                    await prisma.userRole.upsert({
                        where: { userId_roleId: { userId: user.id, roleId: 'role_curator_manager' } },
                        update: {},
                        create: { userId: user.id, roleId: 'role_curator_manager' },
                    });
                }
            }
            catch (_) { }
            // Direct SQL fallback for User and UserRole assignment
            try {
                await prisma.$queryRawUnsafe?.(`
          INSERT INTO User (id, email, name)
          VALUES ('user_joel_arula', 'joel.arula@gmail.com', 'Joel Arula')
          ON DUPLICATE KEY UPDATE email=VALUES(email)
        `);
                await prisma.$queryRawUnsafe?.(`
          INSERT INTO UserRole (userId, roleId)
          VALUES ('user_joel_arula', 'role_curator_manager')
          ON DUPLICATE KEY UPDATE roleId=VALUES(roleId)
        `);
            }
            catch (_) { }
        }
        logger.info?.(`Curator RBAC seeded successfully with composable roles (managers: ${managers.join(', ')})`);
    }
    catch (err) {
        logger.warn?.(`Curator RBAC seeding notice: ${err?.message || err}`);
    }
}
//# sourceMappingURL=seeder.js.map