import type { CuratorAuthOptions } from './types.js';
import { AuthorizationEngine } from './engine.js';
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
export declare function curatorAuthPlugin(options?: CuratorAuthOptions): CuratorAuthPluginInstance;
export default curatorAuthPlugin;
//# sourceMappingURL=index.d.ts.map