import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { pokerPlugin } from '../src/plugins/pokerPlugin.ts';
import { AgentRoleService, curatorEngine, provisionSqliteDb } from '../src/curator.ts';
import { createCuratorHost } from '../src/curatorHost.ts';

test('Poker RBAC — Declarative Plugin Roles & Whitelist Enforcement', async (t) => {
  const tempDb = path.join(os.tmpdir(), `poker_rbac_test_${Date.now()}.db`);

  t.after(async () => {
    try {
      if (fs.existsSync(tempDb)) fs.unlinkSync(tempDb);
    } catch {}
  });

  await t.test('1. Plugin manifests domain roles, combinations, and tools correctly', () => {
    assert.ok(pokerPlugin.roles, 'pokerPlugin defines domain roles');
    assert.ok((pokerPlugin.roles as any)['poker:dealer'], 'defines poker:dealer role');
    assert.ok((pokerPlugin.roles as any)['poker:player'], 'defines poker:player role');
    assert.ok((pokerPlugin.roles as any)['poker:spectator'], 'defines poker:spectator role');

    // Multi-role default user
    assert.deepEqual(pokerPlugin.defaultUserRoles, ['poker:player', 'poker:spectator']);

    // Tools have requiredRole and accessLevel
    const tools = pokerPlugin.tools as any;
    // The table engine is a pure reducer, not a role-gated tool
    assert.equal(typeof (pokerPlugin.reducers as any)?.poker_table_command, 'function');
    assert.equal(tools?.poker_table_command, undefined);

    const depositBuyIn = tools?.poker_deposit_buy_in;
    assert.equal(depositBuyIn.requiredRole, 'poker:player');

    const listTables = tools?.poker_list_tables;
    assert.equal(listTables.requiredRole, 'poker:spectator');
  });

  await t.test('2. Strict Whitelist Enforcement on Actor Tool Access', async () => {
    // Unbound execution -> DENIED
    const unboundCheck = await AgentRoleService.validateActorToolAccess(
      {} as any,
      {},
      'poker_deposit_buy_in',
      { name: 'poker_deposit_buy_in', requiredRole: 'poker:player' }
    );
    assert.equal(unboundCheck.allowed, false);
    assert.match(unboundCheck.reason || '', /Unbound tool execution/);

    // Mock prisma with role inheritance
    const mockPrisma: any = {
      user: {
        findFirst: async ({ where }: any) => {
          if (where.OR?.[0]?.id === 'player_with_combination') {
            return {
              id: 'player_with_combination',
              name: 'Combined User',
              roles: [
                { role: { name: 'poker:player' } },
                { role: { name: 'poker:spectator' } },
              ],
            };
          }
          if (where.OR?.[0]?.id === 'guest_no_roles') {
            return { id: 'guest_no_roles', name: 'Guest', roles: [] };
          }
          if (where.OR?.[0]?.id === 'dealer_actor') {
            return {
              id: 'dealer_actor',
              name: 'Dealer User',
              roles: [{ role: { name: 'poker:dealer' } }],
            };
          }
          return null;
        },
      },
      agent: {
        findFirst: async ({ where }: any) => {
          if (where.OR?.[0]?.id === 'viper') {
            return {
              id: 'viper',
              name: 'Viper (Shark)',
              roles: [
                { role: { name: 'poker:player' } },
                { role: { name: 'agent:reader' } },
              ],
            };
          }
          if (where.OR?.[0]?.id === 'rogue_bot') {
            return { id: 'rogue_bot', name: 'Rogue Bot', roles: [] };
          }
          return null;
        },
      },
      role: {
        findFirst: async ({ where }: any) => {
          const val = where.OR?.[0]?.name || where.OR?.[0]?.id || where.OR?.[1]?.name || where.OR?.[1]?.id;
          if (val === 'poker:dealer' || val === 1 || val === '1') return { id: 1, name: 'poker:dealer' };
          if (val === 'poker:player' || val === 2 || val === '2') return { id: 2, name: 'poker:player' };
          if (val === 'poker:spectator' || val === 3 || val === '3') return { id: 3, name: 'poker:spectator' };
          return null;
        },
      },
      roleInheritance: {
        findMany: async ({ where }: any) => {
          // poker:dealer -> poker:player
          if (where.parentId === 1 || where.parentId === '1' || where.parentId === 'poker:dealer') {
            return [{ subRoleId: 2, subRole: { name: 'poker:player' } }];
          }
          // poker:player -> poker:spectator
          if (where.parentId === 2 || where.parentId === '2' || where.parentId === 'poker:player') {
            return [{ subRoleId: 3, subRole: { name: 'poker:spectator' } }];
          }
          return [];
        },
      },
    };

    // Case A: User with no roles is DENIED
    const noRoleCheck = await AgentRoleService.validateActorToolAccess(
      mockPrisma,
      { userId: 'guest_no_roles' },
      'poker_deposit_buy_in',
      { name: 'poker_deposit_buy_in', requiredRole: 'poker:player' }
    );
    assert.equal(noRoleCheck.allowed, false);
    assert.match(noRoleCheck.reason || '', /has no assigned roles/);

    // Case B: Agent with no roles is DENIED
    const rogueCheck = await AgentRoleService.validateActorToolAccess(
      mockPrisma,
      { agentId: 'rogue_bot' },
      'poker_deposit_buy_in',
      { name: 'poker_deposit_buy_in', requiredRole: 'poker:player' }
    );
    assert.equal(rogueCheck.allowed, false);
    assert.match(rogueCheck.reason || '', /has no assigned roles/);

    // Case C: Agent 'viper' has poker:player -> can poker_deposit_buy_in
    const viperAction = await AgentRoleService.validateActorToolAccess(
      mockPrisma,
      { agentId: 'viper' },
      'poker_deposit_buy_in',
      { name: 'poker_deposit_buy_in', requiredRole: 'poker:player' }
    );
    assert.equal(viperAction.allowed, true);

    // Case D: Agent 'viper' attempting dealer tool dealer_only_tool is DENIED
    const viperCheat = await AgentRoleService.validateActorToolAccess(
      mockPrisma,
      { agentId: 'viper' },
      'dealer_only_tool',
      { name: 'dealer_only_tool', requiredRole: 'poker:dealer' }
    );
    assert.equal(viperCheat.allowed, false);
    assert.match(viperCheat.reason || '', /not whitelisted for tool 'dealer_only_tool'/);

    // Case E: Human user with combination ['poker:player', 'poker:spectator']
    const playerAction = await AgentRoleService.validateActorToolAccess(
      mockPrisma,
      { userId: 'player_with_combination' },
      'poker_deposit_buy_in',
      { name: 'poker_deposit_buy_in', requiredRole: 'poker:player' }
    );
    assert.equal(playerAction.allowed, true);

    const spectatorAction = await AgentRoleService.validateActorToolAccess(
      mockPrisma,
      { userId: 'player_with_combination' },
      'poker_list_tables',
      { name: 'poker_list_tables', requiredRole: 'poker:spectator' }
    );
    assert.equal(spectatorAction.allowed, true);

    // Case F: Role Inheritance — Dealer user has poker:dealer, which inherits poker:player and poker:spectator
    const dealerStartHand = await AgentRoleService.validateActorToolAccess(
      mockPrisma,
      { userId: 'dealer_actor' },
      'dealer_only_tool',
      { name: 'dealer_only_tool', requiredRole: 'poker:dealer' }
    );
    assert.equal(dealerStartHand.allowed, true);

    const dealerPlayerTool = await AgentRoleService.validateActorToolAccess(
      mockPrisma,
      { userId: 'dealer_actor' },
      'poker_deposit_buy_in',
      { name: 'poker_deposit_buy_in', requiredRole: 'poker:player' }
    );
    assert.equal(dealerPlayerTool.allowed, true, 'poker:dealer inherits poker:player');

    const dealerSpectatorTool = await AgentRoleService.validateActorToolAccess(
      mockPrisma,
      { userId: 'dealer_actor' },
      'poker_list_tables',
      { name: 'poker_list_tables', requiredRole: 'poker:spectator' }
    );
    assert.equal(dealerSpectatorTool.allowed, true, 'poker:dealer transitively inherits poker:spectator');
  });

  await t.test('3. Host Seeding with pokerPlugin persists roles and agent assignments', async () => {
    const host = await createCuratorHost({
      name: 'poker_rbac_test',
      curatorDb: { path: tempDb, forceReset: true },
      registerPlugins: async () => {
        curatorEngine.registerPlugin(pokerPlugin);
        return curatorEngine;
      },
    });

    const seedResult = await host.seed();
    assert.ok(seedResult.seededRoles && seedResult.seededRoles.length >= 4, 'Seeded at least 4 poker roles');
    assert.ok(seedResult.seededRoles.includes('poker:dealer'));
    assert.ok(seedResult.seededRoles.includes('poker:player'));
    assert.ok(seedResult.seededRoles.includes('poker:spectator'));

    // Verify DB records
    const rolesInDb = await host.prisma.role.findMany();
    const roleNames = rolesInDb.map((r: any) => r.name);
    assert.ok(roleNames.includes('poker:dealer'));
    assert.ok(roleNames.includes('poker:player'));
    assert.ok(roleNames.includes('poker:spectator'));

    // Verify RoleInheritance in DB
    const inheritances = await host.prisma.roleInheritance.findMany({
      include: { parent: true, subRole: true },
    });
    assert.ok(inheritances.length >= 2, 'Role inheritance was seeded');
    const hasDealerPlayer = inheritances.some(
      (inh: any) => inh.parent?.name === 'poker:dealer' && inh.subRole?.name === 'poker:player'
    );
    assert.ok(hasDealerPlayer, 'poker:dealer -> poker:player inheritance recorded');

    // Verify Agent roles
    const viperAgent = await host.prisma.agent.findFirst({
      where: { id: 'viper' },
      include: { roles: { include: { role: true } } },
    });
    assert.ok(viperAgent, 'viper agent exists in DB');
    const viperRoleNames = viperAgent.roles.map((r: any) => r.role.name);
    assert.ok(viperRoleNames.includes('poker:player'), 'viper has poker:player role');

    // Verify Domain User roles (multi-role combination: poker:player + poker:spectator)
    const domainUser = await host.prisma.user.findFirst({
      where: { id: host.user.id },
      include: { roles: { include: { role: true } } },
    });
    assert.ok(domainUser, 'domain user exists');
    const userRoleNames = domainUser.roles.map((r: any) => r.role.name);
    assert.ok(userRoleNames.includes('poker:player'), 'domain user has poker:player');
    assert.ok(userRoleNames.includes('poker:spectator'), 'domain user has poker:spectator');

    await host.stop();
  });

  await t.test('4. Multi-Project Support: Projects with 0-n roles and project-scoped user access', async () => {
    const host = await createCuratorHost({
      name: 'multi_project_rbac_test',
      curatorDb: { path: tempDb, forceReset: false },
      registerPlugins: async () => {
        curatorEngine.registerPlugin(pokerPlugin);
        return curatorEngine;
      },
    });

    // 1. Create a casual table project with poker:player and poker:spectator roles
    const casualTable = await host.createProject({
      id: 'table_casual',
      name: 'Casual Table #1',
      roles: ['poker:player', 'poker:spectator'],
      assignDefaultRolesToUser: false,
    });
    assert.equal(casualTable.project.id, 'table_casual');
    assert.ok(casualTable.projectRoles.includes('poker:player'));
    assert.ok(casualTable.projectRoles.includes('poker:spectator'));

    // 2. Create a VIP lounge project with ONLY poker:dealer and poker:spectator (NO poker:player!)
    const vipLounge = await host.createProject({
      id: 'table_vip',
      name: 'VIP High Stakes Room',
      roles: ['poker:dealer', 'poker:spectator'],
      assignDefaultRolesToUser: false,
    });
    assert.equal(vipLounge.project.id, 'table_vip');
    assert.ok(!vipLounge.projectRoles.includes('poker:player'), 'VIP lounge does not assign poker:player role');

    // 3. Create test human user
    const alice = await host.prisma.user.create({
      data: {
        id: `alice_${Date.now()}`,
        name: 'Alice',
        email: `alice_${Date.now()}@poker.test`,
      },
    });

    // 4. Assign Alice poker:player role scoped strictly to table_casual via UserRole database relation
    await host.assignUserProjectRole(alice.id, 'poker:player', 'table_casual');
    // Assign Alice poker:spectator role scoped to table_vip
    await host.assignUserProjectRole(alice.id, 'poker:spectator', 'table_vip');

    // 5. Verify Alice's roles per project
    const casualRoles = await host.getUserProjectRoles(alice.id, 'table_casual');
    assert.ok(casualRoles.includes('poker:player'));

    const vipRoles = await host.getUserProjectRoles(alice.id, 'table_vip');
    assert.ok(vipRoles.includes('poker:spectator'));
    assert.ok(!vipRoles.includes('poker:player'), 'Alice does not have player role in VIP table');

    // 6. Test tool validation with project scope via AgentRoleService
    // In table_casual, Alice can play (poker_deposit_buy_in requires poker:player)
    const casualCheck = await AgentRoleService.validateActorToolAccess(
      host.prisma,
      { userId: alice.id, projectId: 'table_casual' },
      'poker_deposit_buy_in',
      { name: 'poker_deposit_buy_in', requiredRole: 'poker:player' }
    );
    assert.equal(casualCheck.allowed, true, 'Alice is permitted to play in casual table');

    // In table_vip, Alice attempting to play is DENIED
    const vipCheck = await AgentRoleService.validateActorToolAccess(
      host.prisma,
      { userId: alice.id, projectId: 'table_vip' },
      'poker_deposit_buy_in',
      { name: 'poker_deposit_buy_in', requiredRole: 'poker:player' }
    );
    assert.equal(vipCheck.allowed, false, 'Alice is blocked from playing in VIP table');

    // But Alice CAN spectate in table_vip (poker_list_tables requires poker:spectator)
    const vipSpectateCheck = await AgentRoleService.validateActorToolAccess(
      host.prisma,
      { userId: alice.id, projectId: 'table_vip' },
      'poker_list_tables',
      { name: 'poker_list_tables', requiredRole: 'poker:spectator' }
    );
    assert.equal(vipSpectateCheck.allowed, true, 'Alice can spectate in VIP table');

    // 7. Verify listProjects returns both projects with their 0-n roles
    const allProjects = await host.listProjects();
    assert.ok(allProjects.length >= 3, 'Lists default project plus both new tables');
    const casualProjRec = allProjects.find((p: any) => p.id === 'table_casual');
    assert.ok(casualProjRec, 'Casual project found');
    assert.equal(casualProjRec.roles.length, 2, 'Casual project has 2 roles');

    await host.stop();
  });
});
