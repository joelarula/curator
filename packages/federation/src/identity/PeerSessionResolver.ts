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
  // Role.name is only unique per project and Role.id has no default; system roles use id = name.
  const role = await prisma.role.upsert({
    where: { id: roleName },
    update: {},
    create: {
      id: roleName,
      name: roleName,
      description: `Federated Peer Role for ${name}`,
    },
  });

  // Bind User to Role
  const existingUr = await prisma.userRole.findFirst({
    where: {
      userId: user.id,
      roleId: role.id,
      projectId: projectId || null,
    },
  });
  if (!existingUr) {
    await prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: role.id,
        projectId: projectId || null,
      },
    });
  }

  // 4. allowedTools: roles only. Each tool gets a `tool:<name>` role, included in the peer's role (RoleInheritance);
  // the access check allows a tool to holders of `tool:<name>`. (Replaces the removed Permission/RolePermission.)
  if (identity.allowedTools && Array.isArray(identity.allowedTools)) {
    for (const toolName of identity.allowedTools) {
      const toolRoleId = `tool:${toolName}`;
      await prisma.role.upsert({
        where: { id: toolRoleId },
        update: {},
        create: { id: toolRoleId, name: toolRoleId, description: `Runs tool ${toolName}` },
      });
      await prisma.roleInheritance.upsert({
        where: { parentId_subRoleId: { parentId: role.id, subRoleId: toolRoleId } },
        update: {},
        create: { parentId: role.id, subRoleId: toolRoleId },
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
