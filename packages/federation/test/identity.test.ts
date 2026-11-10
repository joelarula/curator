import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePeerSession } from '../dist/identity/PeerSessionResolver.js';

test('resolvePeerSession provisions peer user, role, and active session', async () => {
  const users: any[] = [];
  const roles: any[] = [];
  const userRoles: any[] = [];
  const inheritance: any[] = [];
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
      upsert: async (args: any) => {
        const existing = roles.find((r) => r.id === args.where.id);
        if (existing) return Object.assign(existing, args.update);
        const r = { ...args.create };
        roles.push(r);
        return r;
      },
    },
    userRole: {
      findFirst: async (args: any) =>
        userRoles.find((ur) => ur.userId === args.where.userId && ur.roleId === args.where.roleId && ur.projectId === args.where.projectId) || null,
      create: async (args: any) => {
        userRoles.push(args.data);
        return args.data;
      },
    },
    roleInheritance: {
      upsert: async (args: any) => {
        const key = args.where.parentId_subRoleId;
        let r = inheritance.find((x) => x.parentId === key.parentId && x.subRoleId === key.subRoleId);
        if (!r) {
          r = { ...args.create };
          inheritance.push(r);
        }
        return r;
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

  // allowedTools become `tool:<name>` sub-roles of the peer role (roles only, no Permission rows)
  assert.ok(roles.some((r) => r.id === 'tool:search_episodes'));
  assert.ok(roles.some((r) => r.id === 'tool:calculate_metric'));
  assert.deepEqual(
    inheritance.filter((i) => i.parentId === 'PeerWorker').map((i) => i.subRoleId).sort(),
    ['tool:calculate_metric', 'tool:search_episodes']
  );
});
