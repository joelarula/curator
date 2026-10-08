import type { CuratorLogger } from '../types.js';

export interface SeedOptions {
  projectName?: string;
  logger?: CuratorLogger;
  rbacManagers?: string[];
}

export interface SeedResult {
  seededTools: string[];
  seededAgents: string[];
}

export async function seedAgentsAndTools(
  prisma: any,
  engine: any,
  options: SeedOptions = {}
): Promise<SeedResult> {
  const logger = options.logger ?? console;
  const projectName = options.projectName || 'Curator';

  // 1. Ensure system user & project exist
  const user = await prisma.user.upsert({
    where: { email: 'system@local' },
    update: {},
    create: { id: '1', name: 'System User', email: 'system@local' },
  });

  const project = await prisma.project.upsert({
    where: { id: '1' },
    update: {},
    create: { id: '1', name: projectName, userId: user.id },
  });

  // Ensure default conversation
  let conversation = await prisma.conversation.findFirst({
    where: { userId: user.id, projectId: project.id },
  });
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: { userId: user.id, projectId: project.id },
    });
  }

  // 2. Sync tools
  const seededTools: string[] = [];
  if (engine?.tools) {
    for (const [name, tool] of engine.tools.entries()) {
      const accessLevel = (tool as any).accessLevel ?? 'safe_write';
      const requiresConfirmation = (tool as any).requiresConfirmation ?? false;
      const description = (tool as any).description ?? '';

      await prisma.tool.upsert({
        where: { name },
        update: { description, version: '1.0.0', accessLevel, requiresConfirmation },
        create: { name, description, version: '1.0.0', accessLevel, requiresConfirmation },
      });
      seededTools.push(name);
    }
  }

  // 3. Sync agents and scripts
  const seededAgents: string[] = [];
  if (engine?.agents) {
    for (const [name, rawDef] of engine.agents.entries()) {
      const definition = rawDef as any;
      const isExplicitlyEnabled = definition.enabled === true;
      const ast = definition.ast ?? {
        type: definition.type || 'Curator_Tool',
        toolName: definition.toolName,
        args: definition.args || {},
      };

      const script = await prisma.script.upsert({
        where: { name },
        update: {
          body: `// Workflow: ${name}`,
          ast,
          userId: user.id,
          projectId: project.id,
        },
        create: {
          name,
          body: `// Workflow: ${name}`,
          ast,
          userId: user.id,
          projectId: project.id,
        },
      });

      await prisma.agent.upsert({
        where: { name },
        // On update: preserve existing enabled state (allows Curator Console to control activation)
        update: {
          scriptId: script.id,
          userId: user.id,
          projectId: project.id,
          schedule: definition.schedule ?? '0 * * * *',
        },
        // On create: seed with definition.enabled if explicitly true, otherwise false by default
        create: {
          name,
          scriptId: script.id,
          userId: user.id,
          projectId: project.id,
          enabled: isExplicitlyEnabled,
          schedule: definition.schedule ?? '0 * * * *',
        },
      });

      seededAgents.push(name);
    }
  }

  // 4. Seed RBAC roles if requested
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

  logger.info?.(`[Seed] Completed seeding ${seededTools.length} tools and ${seededAgents.length} agents for project '${projectName}'.`);

  return { seededTools, seededAgents };
}
