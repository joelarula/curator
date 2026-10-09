import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePeerSession } from '../dist/identity/PeerSessionResolver.js';

test('resolvePeerSession provisions peer user, role, and active session', async () => {
  const users: any[] = [];
  const roles: any[] = [];
  const userRoles: any[] = [];
  const permissions: any[] = [];
  const rolePermissions: any[] = [];
  const sessions: any[] = [];
  const projects: any[] = [];

  const mockPrisma: any = {
    project: {
      upsert: async (args: any) => {
        let p = projects.find((x) => x.id === args.where.id);
        if (!p) {
          p = { ...args.create };
          projects.push(p);
        }
        return p;
      },
    },
    user: {
      upsert: async (args: any) => {
        let u = users.find((x) => x.email === args.where.email);
        if (!u) {
          u = { id: 'usr_' + (users.length + 1), ...args.create };
          users.push(u);
        } else {
          Object.assign(u, args.update);
        }
        return u;
      },
    },
    role: {
      findUnique: async (args: any) => roles.find((r) => r.name === args.where.name) || null,
      create: async (args: any) => {
        const r = { id: 'role_' + (roles.length + 1), ...args.data };
        roles.push(r);
        return r;
      },
    },
    userRole: {
      upsert: async (args: any) => {
        userRoles.push(args.create);
        return args.create;
      },
    },
    permission: {
      upsert: async (args: any) => {
        let p = permissions.find((x) => x.name === args.where.name);
        if (!p) {
          p = { id: 'perm_' + (permissions.length + 1), ...args.create };
          permissions.push(p);
        }
        return p;
      },
    },
    rolePermission: {
      upsert: async (args: any) => {
        rolePermissions.push(args.create);
        return args.create;
      },
    },
    session: {
      upsert: async (args: any) => {
        let s = sessions.find((x) => x.id === args.where.id);
        if (!s) {
          s = { ...args.create };
          sessions.push(s);
        } else {
          Object.assign(s, args.update);
        }
        return s;
      },
    },
  };

  const context = await resolvePeerSession(
    mockPrisma,
    {
      id: 'facilitator-node',
      name: 'Facilitator Agent Harness',
      roleName: 'PeerWorker',
      allowedTools: ['search_episodes', 'calculate_metric'],
    },
    'project-99'
  );

  assert.ok(context.userId);
  assert.equal(context.projectId, 'project-99');
  assert.equal(context.sessionId, 'session_peer_facilitator-node');
  assert.equal(context.user.email, 'facilitator-node@federation.local');
  assert.equal(context.user.name, 'Facilitator Agent Harness');
  assert.equal(context.role.name, 'PeerWorker');

  // Verify tool permissions provisioned
  assert.equal(permissions.length, 2);
  assert.ok(permissions.some((p) => p.name === 'tool:search_episodes:execute'));
  assert.ok(permissions.some((p) => p.name === 'tool:calculate_metric:execute'));
});
