import { CURATOR_ROLES } from './types.js';
import { AuthorizationEngine } from './engine.js';
import { setupGoogleAuth, getUserFromToken, requireRole } from './passport.js';
import { seedCuratorRbac } from './seeder.js';
export * from './types.js';
export * from './engine.js';
export * from './passport.js';
export * from './seeder.js';
export * from './graphql.js';
export function curatorAuthPlugin(options = {}) {
    const engine = new AuthorizationEngine({ defaultManagers: options.defaultManagers });
    return {
        name: 'curator-auth-rbac',
        version: '1.0.0',
        engine,
        setupAuth: (app) => setupGoogleAuth(app, options, engine),
        getUserFromToken: (token, prisma) => getUserFromToken(token, prisma, options.jwtSecret, engine),
        seedRbac: (prisma) => seedCuratorRbac(prisma, { managers: options.defaultManagers }),
        requireRole: (roleName) => requireRole(roleName || CURATOR_ROLES.MANAGER, engine),
    };
}
export default curatorAuthPlugin;
//# sourceMappingURL=index.js.map