import type { McpActor } from './types.js';

export interface VerifiedIdentity {
  issuer: string;
  subject: string;
  email?: string;
  name?: string;
}

export interface UserActorMapperOptions {
  /** Project the caller's tool Requests belong to (the server's project). */
  projectId: string;
  /** Roles granted in that project on first sight (created if missing); RBAC then decides per tool. */
  roles?: string[];
  /** Admission policy; default: every verified identity with an email. */
  allow?(identity: VerifiedIdentity): boolean;
  /** Issuers whose subject is stored in `User.googleId` (default: Google). */
  googleIssuers?: string[];
  cacheTtlMs?: number;
}

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

/** Admission by email list and/or domain (e.g. from ALLOWED_EMAILS="a@x.com,@corp.com"). */
export function emailAllowList(entries: string[]): (identity: VerifiedIdentity) => boolean {
  const normalized = entries.map((e) => e.trim().toLowerCase()).filter(Boolean);
  return (identity) => {
    const email = identity.email?.toLowerCase();
    if (!email) return false;
    return normalized.some((entry) => (entry.startsWith('@') ? email.endsWith(entry) : email === entry));
  };
}

/**
 * Maps a verified external identity to a Curator user (by Google subject, then email; created on
 * first sight) with roles in the server's project. Results are cached briefly per subject.
 */
export function createUserActorMapper(host: { prisma: any; assignUserProjectRole?(userId: string, role: string, projectId: string): Promise<any> }, options: UserActorMapperOptions) {
  const googleIssuers = new Set(options.googleIssuers ?? GOOGLE_ISSUERS);
  const ttl = options.cacheTtlMs ?? 5 * 60 * 1000;
  const cache = new Map<string, { actor: McpActor; until: number }>();
  const roles = options.roles ?? [];
  const prisma = host.prisma;

  const ensureRoles = async (userId: string) => {
    for (const role of roles) {
      await prisma.role.upsert({ where: { id: role }, update: {}, create: { id: role, name: role } });
      if (host.assignUserProjectRole) {
        await host.assignUserProjectRole(userId, role, options.projectId);
      } else {
        const existing = await prisma.userRole.findFirst({ where: { userId, roleId: role, projectId: options.projectId } });
        if (!existing) await prisma.userRole.create({ data: { userId, roleId: role, projectId: options.projectId } });
      }
    }
  };

  return async (identity: VerifiedIdentity): Promise<McpActor | null> => {
    const cacheKey = `${identity.issuer}\0${identity.subject}`;
    const hit = cache.get(cacheKey);
    if (hit && hit.until > Date.now()) return hit.actor;
    if (!identity.email) return null;
    if (options.allow && !options.allow(identity)) return null;

    const isGoogle = googleIssuers.has(identity.issuer);
    let user = isGoogle ? await prisma.user.findUnique({ where: { googleId: identity.subject } }) : null;
    user ??= await prisma.user.findUnique({ where: { email: identity.email } });
    if (!user) {
      user = await prisma.user.create({
        data: { email: identity.email, name: identity.name ?? identity.email, ...(isGoogle ? { googleId: identity.subject } : {}) },
      });
    } else if (isGoogle && !user.googleId) {
      user = await prisma.user.update({ where: { id: user.id }, data: { googleId: identity.subject } });
    } else if (isGoogle && user.googleId !== identity.subject) {
      // The email is bound to a different Google account: refuse rather than merge identities.
      return null;
    }
    await ensureRoles(user.id);

    const actor: McpActor = { userId: user.id, projectId: options.projectId, roleNames: roles };
    cache.set(cacheKey, { actor, until: Date.now() + ttl });
    return actor;
  };
}
