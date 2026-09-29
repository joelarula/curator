import type { Express } from 'express';
import {
  curatorAuthPlugin,
  AuthorizationEngine,
  AuthorizationError,
  CURATOR_ROLES,
  type CuratorAuthUser,
  type CuratorAuthPluginInstance,
} from '@curator/plugin-auth';

export type AuthUser = CuratorAuthUser;

export {
  AuthorizationEngine,
  AuthorizationError,
  CURATOR_ROLES,
};

let _pluginInstance: CuratorAuthPluginInstance | null = null;

export function getAuthPlugin(getPrisma?: () => any): CuratorAuthPluginInstance {
  if (!_pluginInstance || getPrisma) {
    _pluginInstance = curatorAuthPlugin({
      jwtSecret: process.env.JWT_SECRET || 'keeris-curator-secret-key-change-me',
      defaultManagers: ['joel.arula@gmail.com'],
      googleClientId: process.env.GOOGLE_CLIENT_ID,
      googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
      googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:4001/auth/google/callback',
      frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3001',
      getPrisma,
    });
  }
  return _pluginInstance;
}

export const authEngine = new AuthorizationEngine({
  defaultManagers: ['joel.arula@gmail.com'],
});

export async function getUserRoles(userId: string, email: string, prisma?: any): Promise<string[]> {
  return authEngine.getUserRoles(userId, email, prisma);
}

export function setupAuth(app: Express, getPrisma: () => any): void {
  const plugin = getAuthPlugin(getPrisma);
  plugin.setupAuth(app);
}

export async function getUserFromToken(token: string, prisma?: any): Promise<AuthUser | null> {
  const plugin = getAuthPlugin();
  return plugin.getUserFromToken(token, prisma);
}

export function requireRole(roleName: string = CURATOR_ROLES.MANAGER) {
  return (getAuthPlugin()).requireRole(roleName);
}
