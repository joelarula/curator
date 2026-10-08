import type { CuratorAuthUser, CuratorAuthOptions } from './types.js';
import { AuthorizationEngine } from './engine.js';
export declare function setupGoogleAuth(app: any, options: CuratorAuthOptions, engine?: AuthorizationEngine): void;
export declare function getUserFromToken(token: string, prisma?: any, jwtSecret?: string, engine?: AuthorizationEngine): Promise<CuratorAuthUser | null>;
export declare function requireRole(roleName?: string, engine?: AuthorizationEngine): (req: any, res: any, next: any) => void;
//# sourceMappingURL=passport.d.ts.map