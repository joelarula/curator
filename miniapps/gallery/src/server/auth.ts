import type { Express } from 'express';
import {
  curatorAuthPlugin,
  AuthorizationEngine,
  AuthorizationError,
  CURATOR_ROLES,
  type CuratorAuthUser,
  type CuratorAuthPluginInstance,
} from '@curator/plugin-auth';
import type { GalleryHost } from '../host.ts';
import type { UserProjectAccessDTO } from '../services/projectAuthSeeder.ts';

export interface AuthUser extends CuratorAuthUser {
  projects?: UserProjectAccessDTO[];
  defaultProjectId?: string;
}

export {
  AuthorizationEngine,
  AuthorizationError,
  CURATOR_ROLES,
};

let _pluginInstance: CuratorAuthPluginInstance | null = null;
let _hostRef: GalleryHost | null = null;

export function getAuthPlugin(
  getPrisma?: () => any,
  host?: GalleryHost
): CuratorAuthPluginInstance {
  if (host) _hostRef = host;
  const authCfg = _hostRef?.authConfig;
  if (!_pluginInstance || getPrisma || host) {
    _pluginInstance = curatorAuthPlugin({
      jwtSecret:
        authCfg?.jwtSecret ||
        process.env.JWT_SECRET ||
        'gallery-curator-secret-key-change-me',
      defaultManagers: authCfg?.defaultManagers || [
        'joel.arula@gmail.com',
        'mailbox@artmoments.ee',
      ],
      googleClientId: authCfg?.googleClientId || process.env.GOOGLE_CLIENT_ID,
      googleClientSecret:
        authCfg?.googleClientSecret || process.env.GOOGLE_CLIENT_SECRET,
      googleCallbackUrl:
        authCfg?.googleCallbackUrl ||
        process.env.GOOGLE_CALLBACK_URL ||
        'http://localhost:4005/auth/google/callback',
      frontendUrl:
        authCfg?.frontendUrl ||
        process.env.FRONTEND_URL ||
        'http://localhost:3005',
      getPrisma,
    });
  }
  return _pluginInstance;
}

export const authEngine = new AuthorizationEngine({
  defaultManagers: ['joel.arula@gmail.com', 'mailbox@artmoments.ee'],
});

export async function getUserRoles(
  userId: string,
  email: string,
  prisma?: any
): Promise<string[]> {
  const plugin = getAuthPlugin();
  return plugin.engine.getUserRoles(userId, email, prisma);
}

export async function getUserFromToken(
  token: string,
  prisma?: any,
  host?: GalleryHost
): Promise<AuthUser | null> {
  const activeHost = host || _hostRef;
  const plugin = getAuthPlugin(undefined, activeHost || undefined);
  const rawUser = await plugin.getUserFromToken(token, prisma);
  if (!rawUser) return null;

  // Ensure user.id & roles align with seeded User record by email if present
  if (prisma?.user && rawUser.email) {
    try {
      const dbUser = await prisma.user.findUnique({
        where: { email: rawUser.email.toLowerCase().trim() },
      });
      if (dbUser) {
        rawUser.id = dbUser.id;
        rawUser.name = dbUser.name || rawUser.name;
        const dbRoles = await plugin.engine.getUserRoles(
          dbUser.id,
          dbUser.email,
          prisma
        );
        rawUser.roles = Array.from(new Set([...(rawUser.roles || []), ...dbRoles]));
      }
    } catch {}
  }

  const projects = activeHost
    ? await activeHost.getUserProjects(rawUser)
    : [];
  const defaultProjectId =
    projects[0]?.id || activeHost?.defaultProjectId || 'artmoments';

  return {
    ...rawUser,
    projects,
    defaultProjectId,
  };
}

export function setupAuth(
  app: Express,
  getPrisma: () => any,
  host?: GalleryHost
): void {
  const plugin = getAuthPlugin(getPrisma, host);

  // Enrich /auth/me with user's seeded gallery project access from gallery.config.yaml & DB
  app.get('/auth/me', async (req: any, res: any) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : (req.query?.token as string);
    if (!token) {
      return res.status(401).json({ user: null });
    }
    const user = await getUserFromToken(token, getPrisma(), host);
    if (!user) {
      return res.status(401).json({ user: null });
    }
    return res.json({ user });
  });

  plugin.setupAuth(app);
}

export function requireRole(roleName: string = CURATOR_ROLES.MANAGER) {
  return getAuthPlugin().requireRole(roleName);
}
