import type { PeerIdentity, PeerDescriptor } from '../types.js';

export interface PeerSessionResult {
  prisma: any;
  userId: string;
  projectId: string;
  sessionId: string;
  user: any;
  session: any;
  role: any;
}

/**
 * Maps a remote peer into the Curator User, Role, Session, and Tool security model.
 * Idempotently provisions database user, assigns RBAC roles & permissions,
 * and creates or activates the peer's scoped session.
 */
export async function resolvePeerSession(
  prisma: any,
  peer: PeerIdentity | PeerDescriptor,
  projectId: string = '1'
): Promise<PeerSessionResult> {
  const peerId = peer.id;
  const identity = (peer as PeerDescriptor).identity || (peer as PeerIdentity);
  const email = identity.email || `${peerId.toLowerCase()}@federation.local`;
  const name = identity.name || peer.name || `Peer: ${peerId}`;
  const roleName = identity.roleName || 'PeerWorker';

  // 1. Upsert database User for the remote peer
  const user = await prisma.user.upsert({
    where: { email },
    update: { name },
    create: {
      email,
      name,
    },
  });

  // 2. Ensure project exists
  await prisma.project.upsert({
    where: { id: projectId },
    update: {},
    create: { id: projectId, name: 'Default Project', userId: user.id },
  });

  // 3. Upsert RBAC Role for the peer
  let role = await prisma.role.findUnique({ where: { name: roleName } });
  if (!role) {
    role = await prisma.role.create({
      data: {
        name: roleName,
        description: `Federated Peer Role for ${name}`,
      },
    });
  }

  // Bind User to Role
  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: user.id,
        roleId: role.id,
      },
    },
    update: {},
    create: {
      userId: user.id,
      roleId: role.id,
    },
  });

  // 4. Provision specific tool permissions if allowedTools is configured
  if (identity.allowedTools && Array.isArray(identity.allowedTools)) {
    for (const toolName of identity.allowedTools) {
      const permName = `tool:${toolName}:execute`;
      const perm = await prisma.permission.upsert({
        where: { name: permName },
        update: {},
        create: { name: permName, toolName },
      });

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: perm.id,
          },
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId: perm.id,
        },
      });
    }
  }

  // 5. Upsert active Session for the peer (if Session model exists in DB schema)
  const sessionId = `session_peer_${peerId}`;
  let session = null;
  if (prisma.session?.upsert) {
    session = await prisma.session.upsert({
      where: { id: sessionId },
      update: {
        activeProjectId: projectId,
        updatedAt: new Date(),
      },
      create: {
        id: sessionId,
        userId: user.id,
        activeProjectId: projectId,
      },
    });
  }

  return {
    prisma,
    userId: user.id,
    projectId,
    sessionId,
    user,
    session,
    role,
  };
}
