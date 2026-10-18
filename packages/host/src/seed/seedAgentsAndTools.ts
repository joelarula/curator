import type { CuratorLogger, SeedResult } from '../types.js';

export interface SeedOptions {
  projectId?: string;
  projectName?: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  logger?: CuratorLogger;
  rbacManagers?: string[];
}

export async function seedAgentsAndTools(
  prisma: any,
  engine: any,
  options: SeedOptions = {}
): Promise<SeedResult> {
  const logger = options.logger ?? console;

  // 1. Ensure system user & system project exist idempotently
  let systemUser = await prisma.user.findFirst({
    where: { OR: [{ email: 'system@local' }, { id: 'system' }, { id: '1' }] },
  });
  if (!systemUser) {
    systemUser = await prisma.user.create({
      data: { id: 'system', name: 'System User', email: 'system@local' },
    });
  }

  let systemProject = await prisma.project.findFirst({
    where: { OR: [{ id: '1' }, { name: 'System Project' }] },
  });
  if (!systemProject) {
    systemProject = await prisma.project.create({
      data: { id: '1', name: 'System Project', userId: systemUser.id },
    });
  }

  // Ensure domain user & project exist if custom ones requested
  const userEmail = options.userEmail || 'system@local';
  const userName = options.userName || 'System User';
  const userId = options.userId || systemUser.id;
  const projectName = options.projectName || 'Curator';
  const projectId = options.projectId || systemProject.id;

  let domainUser = systemUser;
  if (userEmail !== 'system@local' || userId !== systemUser.id) {
    domainUser = await prisma.user.findFirst({
      where: { OR: [{ email: userEmail }, { id: userId }] },
    });
    if (!domainUser) {
      domainUser = await prisma.user.create({
        data: { id: userId, name: userName, email: userEmail },
      });
    }
  }

  let domainProject = systemProject;
  if (projectId !== systemProject.id || projectName !== 'System Project') {
    domainProject = await prisma.project.findFirst({
      where: { OR: [{ id: projectId }, { name: projectName }] },
    });
    if (!domainProject) {
      domainProject = await prisma.project.create({
        data: { id: projectId, name: projectName, userId: domainUser.id },
      });
    }
  }

  // Ensure default conversation
  let conversation = await prisma.conversation.findFirst({
    where: { userId: domainUser.id, projectId: domainProject.id },
  });
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: { userId: domainUser.id, projectId: domainProject.id },
    });
  }

  // 2. Sync plugin roles & role inheritance idempotently
  const allRoles = new Map<string, any>();
  if (engine?.roles) {
    for (const [name, def] of engine.roles.entries()) {
      allRoles.set(name, def);
    }
  }
  if (engine?.plugins) {
    for (const plugin of engine.plugins) {
      if (plugin?.roles) {
        const entries = Array.isArray(plugin.roles)
          ? plugin.roles.map((r: any) => [r.name, r] as [string, any])
          : Object.entries(plugin.roles);
        for (const [name, def] of entries) {
          allRoles.set(name, def);
        }
      }
    }
  }

  const seededRoles: string[] = [];
  if (prisma.role?.upsert) {
    for (const [name, def] of allRoles.entries()) {
      const description = def?.description || `Plugin Role: ${name}`;
      const roleId = def?.id || name;
      const targetProjectId = def?.projectId ?? domainProject?.id ?? null;
      await prisma.role.upsert({
        where: { id: roleId },
        update: { name, description, projectId: targetProjectId },
        create: { id: roleId, name, description, projectId: targetProjectId },
      });
      seededRoles.push(name);
    }

    // Seed RoleInheritance (subRoles)
    if (prisma.roleInheritance?.upsert) {
      for (const [name, def] of allRoles.entries()) {
        if (def?.subRoles && Array.isArray(def.subRoles)) {
          const parentRoleId = def?.id || name;
          for (const subName of def.subRoles) {
            const subDef = allRoles.get(subName);
            const subRoleId = subDef?.id || subName;
            await prisma.roleInheritance.upsert({
              where: { parentId_subRoleId: { parentId: parentRoleId, subRoleId } },
              update: {},
              create: { parentId: parentRoleId, subRoleId },
            });
          }
        }
      }
    }
  }

  // Assign system roles to system user
  const systemRolesToAssign = new Set<string>(['system:admin']);
  if (engine?.plugins) {
    for (const plugin of engine.plugins) {
      if (plugin?.systemRoles && Array.isArray(plugin.systemRoles)) {
        for (const r of plugin.systemRoles) systemRolesToAssign.add(r);
      }
    }
  }
  if (prisma.userRole) {
    for (const roleName of systemRolesToAssign) {
      const roleRec = await prisma.role.findFirst({
        where: { OR: [{ id: roleName }, { name: roleName }] },
      });
      if (roleRec) {
        const existing = await prisma.userRole.findFirst({
          where: { userId: systemUser.id, roleId: roleRec.id, projectId: null },
        });
        if (!existing) {
          await prisma.userRole.create({
            data: { userId: systemUser.id, roleId: roleRec.id, projectId: null },
          });
        }
      }
    }
  }

  // Assign default user roles to domain/human user (supports multi-role combination)
  const domainRolesToAssign = new Set<string>();
  if (engine?.plugins) {
    for (const plugin of engine.plugins) {
      if (plugin?.defaultUserRoles && Array.isArray(plugin.defaultUserRoles)) {
        for (const r of plugin.defaultUserRoles) domainRolesToAssign.add(r);
      }
    }
  }
  if (prisma.userRole && domainRolesToAssign.size > 0) {
    for (const roleName of domainRolesToAssign) {
      const roleRec = await prisma.role.findFirst({
        where: { OR: [{ id: roleName }, { name: roleName }] },
      });
      if (roleRec) {
        // Scoped to domainProject.id
        const existing = await prisma.userRole.findFirst({
          where: { userId: domainUser.id, roleId: roleRec.id, projectId: domainProject.id },
        });
        if (!existing) {
          await prisma.userRole.create({
            data: { userId: domainUser.id, roleId: roleRec.id, projectId: domainProject.id },
          });
        }
      }
    }
  }

  // Assign plugin roles to domainProject via ProjectRole relation (project has 0 - n roles)
  if (prisma.projectRole) {
    for (const roleName of seededRoles) {
      const roleRec = await prisma.role.findFirst({
        where: { OR: [{ id: roleName }, { name: roleName }] },
      });
      if (roleRec) {
        const prExisting = await prisma.projectRole.findFirst({
          where: { projectId: domainProject.id, roleId: roleRec.id },
        });
        if (!prExisting) {
          await prisma.projectRole.create({
            data: { projectId: domainProject.id, roleId: roleRec.id },
          });
        }
      }
    }
  }

  // 3. Sync tools idempotently & attach ToolRole mappings
  const seededTools: string[] = [];
  if (engine?.tools) {
    for (const [name, tool] of engine.tools.entries()) {
      const existing = await prisma.tool.findUnique({ where: { name } });
      const accessLevel = (tool as any).accessLevel ?? 'safe_write';
      const requiresConfirmation = (tool as any).requiresConfirmation ?? false;
      const description = (tool as any).description ?? '';
      const requiredRole = (tool as any).requiredRole ?? null;

      let toolRecord = existing;
      if (!existing) {
        toolRecord = await prisma.tool.create({
          data: { name, description, version: '1.0.0', accessLevel, requiredRole, requiresConfirmation },
        });
        seededTools.push(name);
      } else if (
        existing.description !== description ||
        existing.accessLevel !== accessLevel ||
        existing.requiredRole !== requiredRole ||
        existing.requiresConfirmation !== requiresConfirmation
      ) {
        toolRecord = await prisma.tool.update({
          where: { id: existing.id },
          data: { description, accessLevel, requiredRole, requiresConfirmation },
        });
      }

      // Sync ToolRole relations (explicit many-to-many)
      if (prisma.toolRole?.upsert && toolRecord) {
        const rolesForTool = new Set<string>();
        if (requiredRole) rolesForTool.add(requiredRole);
        if (Array.isArray((tool as any).roles)) {
          for (const r of (tool as any).roles) rolesForTool.add(r);
        }
        for (const rId of rolesForTool) {
          const roleRec = await prisma.role.findFirst({
            where: { OR: [{ id: rId }, { name: rId }] },
          });
          if (roleRec) {
            await prisma.toolRole.upsert({
              where: { toolId_roleId: { toolId: toolRecord.id, roleId: roleRec.id } },
              update: {},
              create: { toolId: toolRecord.id, roleId: roleRec.id },
            });
          }
        }
      }
    }
  }

  // 3. Sync standalone scripts idempotently (scoped to system)
  const seededScripts: string[] = [];
  if (engine?.scripts) {
    for (const [name, rawDef] of engine.scripts.entries()) {
      const existing = await prisma.script.findUnique({ where: { name } });
      const def = rawDef as any;
      const body = typeof def === 'string' ? def : def?.body ?? `// Workflow: ${name}`;
      let ast = def?.ast;

      // If CoffeeScript body is present but ast is missing, compile it to AST
      if (!ast && body) {
        try {
          const mod = (await import('@curator/agent-server')) as any;
          if (typeof mod.compileCoffeeScriptToAST === 'function') {
            ast = await mod.compileCoffeeScriptToAST(body);
          }
        } catch {
          try {
            const { compileCoffeeScriptToAST } = (await import('../../../../curator/dist/src/index.js')) as any;
            if (typeof compileCoffeeScriptToAST === 'function') {
              ast = await compileCoffeeScriptToAST(body);
            }
          } catch {
            // pure coffee/script without AST verbs
          }
        }
      }

      if (!existing) {
        await prisma.script.create({
          data: {
            name,
            body,
            ast: ast ?? null,
            userId: systemUser.id,
            projectId: systemProject.id,
          },
        });
        seededScripts.push(name);
      } else {
        const needsUpdate =
          existing.userId !== systemUser.id ||
          existing.projectId !== systemProject.id ||
          (ast && !existing.ast) ||
          (body && existing.body !== body);

        if (needsUpdate) {
          await prisma.script.update({
            where: { id: existing.id },
            data: {
              body: body || existing.body,
              ast: ast ?? existing.ast,
              userId: systemUser.id,
              projectId: systemProject.id,
            },
          });
        }
      }
    }
  }

  // 4. Sync agents idempotently (scoped to system, schedule defaults to manual)
  const seededAgents: string[] = [];
  if (engine?.agents) {
    for (const [name, rawDef] of engine.agents.entries()) {
      const definition = rawDef as any;
      const agentId = definition.id || name;
      const agentName = definition.name || name;

      const existing = await prisma.agent.findFirst({
        where: { OR: [{ id: agentId }, { name: agentName }] },
      });

      if (!existing) {
        // Resolve script for this agent
        let scriptId = definition.scriptId;
        if (!scriptId && (definition.scriptName || definition.script)) {
          const targetScriptName = definition.scriptName || definition.script;
          const matchedScript = await prisma.script.findUnique({
            where: { name: targetScriptName },
          });
          if (matchedScript) {
            scriptId = matchedScript.id;
          }
        }

        // If agent has inline workflow/ast and no script was linked, create a dedicated script
        if (!scriptId && (definition.ast || definition.body)) {
          const ast = definition.ast ?? {
            type: definition.type || 'Curator_Tool',
            toolName: definition.toolName || name,
            args: definition.args || {},
          };
          const body = definition.body ?? `// Workflow: ${name}`;
          const agentScript = await prisma.script.create({
            data: {
              name: `agent_${name}`,
              body,
              ast,
              userId: systemUser.id,
              projectId: systemProject.id,
            },
          });
          scriptId = agentScript.id;
        }

        const isExplicitlyEnabled = definition.enabled !== false;

        await prisma.agent.create({
          data: {
            id: agentId,
            name: agentName,
            scriptId: scriptId ?? null,
            userId: systemUser.id,
            projectId: systemProject.id,
            enabled: isExplicitlyEnabled,
            schedule: definition.schedule ?? 'manual',
          },
        });

        seededAgents.push(agentName);
      } else {
        const targetSchedule = definition.schedule ?? (existing.schedule === 'every 10 minutes' ? 'manual' : existing.schedule);
        if (existing.userId !== systemUser.id || existing.projectId !== systemProject.id || existing.schedule !== targetSchedule) {
          await prisma.agent.update({
            where: { id: existing.id },
            data: {
              userId: systemUser.id,
              projectId: systemProject.id,
              schedule: targetSchedule,
            },
          });
        }
      }

      // Assign Agent Roles if declared in definition (whitelist-based access)
      if (definition.roles && Array.isArray(definition.roles) && prisma.agentRole?.upsert) {
        for (const roleName of definition.roles) {
          const roleRec = await prisma.role.findFirst({
            where: { OR: [{ id: roleName }, { name: roleName }] },
          });
          if (roleRec) {
            await prisma.agentRole.upsert({
              where: { agentId_roleId: { agentId, roleId: roleRec.id } },
              update: {},
              create: { agentId, roleId: roleRec.id },
            });
          }
        }
      }
    }
  }

  // 5. Seed RBAC roles if requested
  if (options.rbacManagers && options.rbacManagers.length > 0) {
    try {
      const { seedCuratorRbac } = await import('@curator/plugin-auth');
      await seedCuratorRbac(prisma, {
        managers: options.rbacManagers,
        logger: {
          info: (msg: string) => logger.info?.(`[Seed] ${msg}`) ?? logger.log?.(`[Seed] ${msg}`),
          warn: (msg: string) => logger.warn?.(`[Seed] ${msg}`),
          error: (msg: string) => logger.error?.(`[Seed] ${msg}`),
        },
      });
    } catch (err: any) {
      logger.warn?.(`[Seed] RBAC seeding notice: ${err?.message || err}`);
    }
  }

  logger.info?.(
    `[Seed] Completed idempotent seeding: ${seededRoles.length} roles, ${seededTools.length} tools, ${seededScripts.length} scripts, and ${seededAgents.length} agents for project '${domainProject.name}'.`
  );

  return { seededRoles, seededTools, seededScripts, seededAgents };
}
