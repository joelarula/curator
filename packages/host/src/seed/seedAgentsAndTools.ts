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
    where: { OR: [{ email: 'system@local' }, { id: '1' }] },
  });
  if (!systemUser) {
    systemUser = await prisma.user.create({
      data: { id: '1', name: 'System User', email: 'system@local' },
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

  // 2. Sync tools idempotently
  const seededTools: string[] = [];
  if (engine?.tools) {
    for (const [name, tool] of engine.tools.entries()) {
      const existing = await prisma.tool.findUnique({ where: { name } });
      if (!existing) {
        const accessLevel = (tool as any).accessLevel ?? 'safe_write';
        const requiresConfirmation = (tool as any).requiresConfirmation ?? false;
        const description = (tool as any).description ?? '';

        await prisma.tool.create({
          data: { name, description, version: '1.0.0', accessLevel, requiresConfirmation },
        });
        seededTools.push(name);
      }
    }
  }

  // 3. Sync standalone scripts idempotently (scoped to system)
  const seededScripts: string[] = [];
  if (engine?.scripts) {
    for (const [name, rawDef] of engine.scripts.entries()) {
      const existing = await prisma.script.findUnique({ where: { name } });
      if (!existing) {
        const def = rawDef as any;
        const body = typeof def === 'string' ? def : def?.body ?? `// Workflow: ${name}`;
        let ast = def?.ast;

        // If CoffeeScript body is present but ast is missing, compile it to AST
        if (!ast && body) {
          try {
            const { compileCoffeeScriptToAST } = (await import('../../../../curator/dist/src/index.js')) as any;
            if (typeof compileCoffeeScriptToAST === 'function') {
              ast = await compileCoffeeScriptToAST(body);
            }
          } catch {
            // pure coffee/script without AST verbs
          }
        }

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
      } else if (existing.userId !== systemUser.id || existing.projectId !== systemProject.id) {
        await prisma.script.update({
          where: { id: existing.id },
          data: {
            userId: systemUser.id,
            projectId: systemProject.id,
          },
        });
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
    `[Seed] Completed idempotent seeding: ${seededTools.length} tools, ${seededScripts.length} scripts, and ${seededAgents.length} agents for project '${domainProject.name}'.`
  );

  return { seededTools, seededScripts, seededAgents };
}
