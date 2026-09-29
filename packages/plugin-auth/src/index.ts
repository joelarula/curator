import type { CuratorAuthOptions } from './types.js';
import { CURATOR_ROLES } from './types.js';
import { AuthorizationEngine } from './engine.js';
import { setupGoogleAuth, getUserFromToken, requireRole } from './passport.js';
import { seedCuratorRbac } from './seeder.js';

export * from './types.js';
export * from './engine.js';
export * from './passport.js';
export * from './seeder.js';
export * from './graphql.js';

export interface CuratorAuthPluginInstance {
  name: string;
  version: string;
  engine: AuthorizationEngine;
  setupAuth: (app: any) => void;
  getUserFromToken: (token: string, prisma?: any) => Promise<any>;
  seedRbac: (prisma: any) => Promise<void>;
  requireRole: (roleName?: string) => any;
}

export function curatorAuthPlugin(options: CuratorAuthOptions = {}): CuratorAuthPluginInstance {
  const engine = new AuthorizationEngine({ defaultManagers: options.defaultManagers });

  return {
    name: 'curator-auth-rbac',
    version: '1.0.0',
    engine,
    setupAuth: (app: any) => setupGoogleAuth(app, options, engine),
    getUserFromToken: (token: string, prisma?: any) => getUserFromToken(token, prisma, options.jwtSecret, engine),
    seedRbac: (prisma: any) => seedCuratorRbac(prisma, { managers: options.defaultManagers }),
    requireRole: (roleName?: string) => requireRole(roleName || CURATOR_ROLES.MANAGER, engine),
  };
}

export default curatorAuthPlugin;
