import type { CuratorAuthUser } from './types.js';
import { CURATOR_ROLES } from './types.js';

export class AuthorizationError extends Error {
  public code: string;
  public status: number;

  constructor(message: string, code = 'FORBIDDEN', status = 403) {
    super(message);
    this.name = 'AuthorizationError';
    this.code = code;
    this.status = status;
  }
}

export class AuthorizationEngine {
  private defaultManagers: Set<string>;

  constructor(options?: { defaultManagers?: string[] }) {
    this.defaultManagers = new Set(
      (options?.defaultManagers || ['joel.arula@gmail.com']).map((e) => e.toLowerCase().trim())
    );
  }

  /**
   * Check if an email is in the default managers list.
   */
  public isDefaultManager(email?: string | null): boolean {
    if (!email) return false;
    return this.defaultManagers.has(email.toLowerCase().trim());
  }

  /**
   * Resolve all roles for a user from Prisma database (UserRole + Role + composable RoleInheritance).
   * Since roles can be combined into bigger roles, this resolves the entire inheritance tree.
   */
  public async getUserRoles(userId: string, email?: string | null, prisma?: any): Promise<string[]> {
    const roles = new Set<string>();

    if (this.isDefaultManager(email)) {
      roles.add(CURATOR_ROLES.MANAGER);
    }

    if (!prisma) {
      return Array.from(roles);
    }

    try {
      // 1. Prisma relation query for direct user roles
      if (prisma.userRole) {
        const userRoles = await prisma.userRole.findMany({
          where: { userId, deletedAt: null },
          include: { role: true },
        });
        for (const ur of userRoles) {
          const name = ur.role?.name || ur.roleId;
          if (name) roles.add(name);
        }
      }
    } catch (_) {}

    // 2. Direct SQL fallback if relation query fails
    if (roles.size === 0 || !roles.has(CURATOR_ROLES.MANAGER)) {
      try {
        const raw: any = await prisma.$queryRawUnsafe?.(
          `SELECT r.name FROM UserRole ur JOIN Role r ON ur.roleId = r.id WHERE ur.userId = ? AND (ur.deletedAt IS NULL)`,
          userId
        );
        if (Array.isArray(raw)) {
          for (const row of raw) {
            if (row.name) roles.add(row.name);
          }
        }
      } catch (_) {}
    }

    // 3. Resolve role inheritance (parent -> subRole composition)
    // A composite/parent role includes all its subRoles (e.g. curator_manager inherits curator_admin & curator_user).
    try {
      if (prisma.roleInheritance && roles.size > 0) {
        const queue = Array.from(roles);
        const visited = new Set<string>(queue);

        while (queue.length > 0) {
          const currentRoleName = queue.shift()!;
          const inheritances = await prisma.roleInheritance.findMany({
            where: {
              parent: { name: currentRoleName },
            },
            include: { subRole: true },
          });

          for (const item of inheritances) {
            const subRoleName = item.subRole?.name;
            if (subRoleName && !visited.has(subRoleName)) {
              visited.add(subRoleName);
              roles.add(subRoleName);
              queue.push(subRoleName);
            }
          }
        }
      }
    } catch (_) {}

    return Array.from(roles);
  }

  /**
   * Determine if a user has a specific role, or any of the specified roles.
   */
  public hasRole(user?: CuratorAuthUser | null, roleOrRoles: string | string[] = CURATOR_ROLES.MANAGER): boolean {
    if (!user) return false;
    if (this.isDefaultManager(user.email)) return true;
    if (user.roles?.includes(CURATOR_ROLES.MANAGER) || user.roles?.includes(CURATOR_ROLES.ADMIN)) {
      return true;
    }

    const requiredRoles = Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles];
    if (requiredRoles.length === 0) return true;

    const userRoles = new Set(user.roles || []);
    return requiredRoles.some((r) => userRoles.has(r));
  }

  /**
   * Determine if a user has any of the given roles.
   */
  public hasAnyRole(user?: CuratorAuthUser | null, roles: string[] = [CURATOR_ROLES.MANAGER]): boolean {
    return this.hasRole(user, roles);
  }

  /**
   * Guard function that throws an AuthorizationError if the user lacks the role(s).
   */
  public assertRole(
    user?: CuratorAuthUser | null,
    roleOrRoles: string | string[] = CURATOR_ROLES.MANAGER,
    customMessage?: string
  ): void {
    if (!this.hasRole(user, roleOrRoles)) {
      const roleStr = Array.isArray(roleOrRoles) ? roleOrRoles.join(', ') : roleOrRoles;
      throw new AuthorizationError(
        customMessage || `Access denied. Role [${roleStr}] is required to perform this action.`,
        'FORBIDDEN',
        403
      );
    }
  }
}
