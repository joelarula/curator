export interface CuratorRole {
  id: string;
  name: string;
  description?: string | null;
}

export interface CuratorAuthUser {
  id: string;
  email: string;
  name?: string | null;
  googleId?: string | null;
  roles: string[];
}

export const CURATOR_ROLES = {
  MANAGER: 'curator_manager',
  ADMIN: 'curator_admin',
  USER: 'curator_user',
} as const;

export interface CuratorAuthOptions {
  jwtSecret?: string;
  defaultManagers?: string[];
  googleClientId?: string;
  googleClientSecret?: string;
  googleCallbackUrl?: string;
  frontendUrl?: string;
  getPrisma?: () => any;
}
