import type { CuratorAuthUser } from './types.js';
export declare class AuthorizationError extends Error {
    code: string;
    status: number;
    constructor(message: string, code?: string, status?: number);
}
export declare class AuthorizationEngine {
    private defaultManagers;
    constructor(options?: {
        defaultManagers?: string[];
    });
    /**
     * Check if an email is in the default managers list.
     */
    isDefaultManager(email?: string | null): boolean;
    /**
     * Resolve all roles for a user from Prisma database (UserRole + Role + composable RoleInheritance).
     * Since roles can be combined into bigger roles, this resolves the entire inheritance tree.
     */
    getUserRoles(userId: string, email?: string | null, prisma?: any): Promise<string[]>;
    /**
     * Determine if a user has a specific role, or any of the specified roles.
     */
    hasRole(user?: CuratorAuthUser | null, roleOrRoles?: string | string[]): boolean;
    /**
     * Determine if a user has any of the given roles.
     */
    hasAnyRole(user?: CuratorAuthUser | null, roles?: string[]): boolean;
    /**
     * Guard function that throws an AuthorizationError if the user lacks the role(s).
     */
    assertRole(user?: CuratorAuthUser | null, roleOrRoles?: string | string[], customMessage?: string): void;
}
//# sourceMappingURL=engine.d.ts.map