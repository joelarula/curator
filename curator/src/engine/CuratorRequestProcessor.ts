import * as vm from 'node:vm';
import AjvModule from 'ajv';
const Ajv = (AjvModule as any).default || AjvModule;
import { curatorEngine } from './CuratorEngine.js';
import { curatorContext } from './CuratorContext.js';

import type { CuratorAstNode, CuratorAgentNode, CuratorSequentialNode, CuratorParallelNode, CuratorJoinNode, CuratorToolNode, CuratorScriptNode, CuratorRouteNode, CuratorGraphNode } from './CuratorAst.js';
import { logger } from '../utils/logger.js';
import { validateCuratorAst } from './CuratorAstValidation.js';
import { coffeeAstVerbs } from './CoffeeVerbs.js';
import type { Prisma } from '@prisma/client';
import { LlmFactory } from './llm/LlmFactory.js';
import type { LlmMessage, LlmToolDefinition, LlmRequest } from './llm/ILlmProvider.js';

export interface CuratorRequestProcessorOptions {
  onEvent?: (type: string, payload: any) => void;
  maxConcurrency?: number;
  reserveWebConnections?: number;
  poolLimit?: number;
}

export class CuratorRequestProcessor {
  private prisma: any;
  private timer: NodeJS.Timeout | null = null;
  private isPolling = false;
  private activeTasks = 0;
  private backoffUntil: number = 0;
  private workerId = `curator-worker-${Math.random().toString(36).substring(7)}`;
  private onEvent?: (type: string, payload: any) => void;
  private poolLimit: number;
  private reserveWebConnections: number;
  private maxConcurrency: number;

  constructor(prisma: any, options: CuratorRequestProcessorOptions = {}) {
    this.prisma = prisma;
    this.onEvent = options.onEvent;

    // Capacity & Web Headroom Configuration:
    // Guarantees background task execution never exhausts DB pool or starves web threads
    this.poolLimit = options.poolLimit ?? parseInt(process.env.MARIADB_POOL_LIMIT || process.env.DB_POOL_LIMIT || '25', 10);
    this.reserveWebConnections = options.reserveWebConnections ?? (
      process.env.CURATOR_RESERVE_WEB_CONNS ? parseInt(process.env.CURATOR_RESERVE_WEB_CONNS, 10) : Math.max(10, Math.floor(this.poolLimit * 0.6))
    );

    const availableForBg = Math.max(1, this.poolLimit - this.reserveWebConnections);
    // Background tasks typically consume 1-2 connections during queries / tool execution
    const defaultConcurrency = Math.max(1, Math.min(3, Math.floor(availableForBg / 2)));
    const explicitConcurrency = options.maxConcurrency ?? (process.env.CURATOR_MAX_CONCURRENCY ? parseInt(process.env.CURATOR_MAX_CONCURRENCY, 10) : undefined);
    
    this.maxConcurrency = explicitConcurrency ?? defaultConcurrency;
    logger.info(`[CuratorRequestProcessor] Concurrency limit initialized to ${this.maxConcurrency} (DB Pool: ${this.poolLimit}, Reserved for Web: ${this.reserveWebConnections})`);
  }

  private emit(type: string, payload: any) {
    try {
      this.onEvent?.(type, payload);
    } catch (_) {}
  }

  private async createValidatedRequest(args: any) {
    const validation = validateCuratorAst(args.data.ast);
    if (!validation.valid) {
      throw new Error(`Invalid child Curator AST: ${validation.errors.join('; ')}`);
    }
    const cleanData = { ...args.data, ast: validation.node };
    if (cleanData.scheduledAt === null || cleanData.scheduledAt === undefined) {
      delete cleanData.scheduledAt;
    }
    return this.prisma.request.create({
      ...args,
      data: cleanData
    });
  }

  private getConversationState(conv: any): Record<string, any> {
    if (!conv) return {};
    const raw = conv.state ?? conv.metadata;
    if (!raw) return {};
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch { return {}; }
    }
    return typeof raw === 'object' ? raw : {};
  }

  private async updateConversationState(conversationId: any, newState: Record<string, any>) {
    const conv = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    const updateData: any = {};
    if (conv && 'state' in conv) {
      updateData.state = newState;
    } else {
      updateData.metadata = newState;
    }
    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: updateData
    });
  }

  public async start(intervalMs: number = 3000) {
    await this.syncToolsToDb();
    await this.syncAgentsToDb();
    logger.info(`[CuratorRequestProcessor] Starting worker ${this.workerId} with ${intervalMs}ms interval...`);
    this.timer = setInterval(() => this.pollRequests(), intervalMs);
    this.pollRequests();
  }

  private async syncToolsToDb() {
    try {
      logger.info(`[CuratorRequestProcessor] Syncing tools & permissions from CuratorEngine registry...`);
      let count = 0;

      // Ensure base roles exist
      const adminRole = await this.prisma.role.upsert({
        where: { name: 'Admin' },
        update: { description: 'Full system administrator with all tool and agent permissions' },
        create: { name: 'Admin', description: 'Full system administrator with all tool and agent permissions' }
      });

      const workerRole = await this.prisma.role.upsert({
        where: { name: 'AgentWorker' },
        update: { description: 'Standard automated agent worker with safe execution permissions' },
        create: { name: 'AgentWorker', description: 'Standard automated agent worker with safe execution permissions' }
      });

      // Role inheritance: Admin includes subRole AgentWorker
      await this.prisma.roleInheritance.upsert({
        where: {
          parentId_subRoleId: {
            parentId: adminRole.id,
            subRoleId: workerRole.id
          }
        },
        update: {},
        create: {
          parentId: adminRole.id,
          subRoleId: workerRole.id
        }
      });

      for (const [name, tool] of curatorEngine.tools.entries()) {
        const accessLevel = (tool as any).accessLevel ?? 'safe_write';
        const requiresConfirmation = (tool as any).requiresConfirmation ?? false;

        await this.prisma.tool.upsert({
          where: { name },
          update: { description: (tool as any).description ?? '', version: '1.0.0', accessLevel, requiresConfirmation },
          create: { name, description: (tool as any).description ?? '', version: '1.0.0', accessLevel, requiresConfirmation }
        });

        // Upsert permission for tool
        const permName = `tool:${name}:execute`;
        const perm = await this.prisma.permission.upsert({
          where: { name: permName },
          update: { description: `Execute tool ${name}`, toolName: name, accessLevel, requiresConfirmation },
          create: { name: permName, description: `Execute tool ${name}`, toolName: name, accessLevel, requiresConfirmation }
        });

        // Attach to Admin role
        await this.prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: adminRole.id,
              permissionId: perm.id
            }
          },
          update: {},
          create: {
            roleId: adminRole.id,
            permissionId: perm.id
          }
        });

        // If safe, attach to AgentWorker role
        if (accessLevel === 'read_only' || accessLevel === 'safe_write') {
          await this.prisma.rolePermission.upsert({
            where: {
              roleId_permissionId: {
                roleId: workerRole.id,
                permissionId: perm.id
              }
            },
            update: {},
            create: {
              roleId: workerRole.id,
              permissionId: perm.id
            }
          });
        }

        count++;
      }
      logger.info(`[CuratorRequestProcessor] Synced ${count} tools with permissions & nested roles.`);
    } catch (err) {
      logger.error('[CuratorRequestProcessor] Failed to sync tools to DB:', err);
    }
  }

  private async syncAgentsToDb() {
    try {
      logger.info(`[CuratorRequestProcessor] Syncing agents from CuratorEngine registry...`);
      let count = 0;

      const workerRole = await this.prisma.role.findUnique({ where: { name: 'AgentWorker' } });

      for (const [name, agentDef] of curatorEngine.agents.entries()) {
        // Ensure system user and project exist
        const user = await this.prisma.user.upsert({
          where: { email: 'system@local' },
          update: {},
          create: { id: '1', name: 'System User', email: 'system@local' }
        });

        const project = await this.prisma.project.upsert({
          where: { id: '1' },
          update: {},
          create: { id: '1', name: 'System Project', userId: user.id }
        });

        const cleanAst = (agentDef as any).ast || {
          type: (agentDef as any).type || 'Curator_Tool',
          toolName: (agentDef as any).toolName,
          args: (agentDef as any).args || {}
        };

        const script = await this.prisma.script.upsert({
          where: { name },
          update: { body: `// Workflow: ${name}`, ast: cleanAst, userId: user.id, projectId: project.id },
          create: { name, body: `// Workflow: ${name}`, ast: cleanAst, userId: user.id, projectId: project.id }
        });

        const isAgentEnabled = (agentDef as any).enabled === true;
        const agent = await this.prisma.agent.upsert({
          where: { name },
          update: { scriptId: script.id, userId: user.id, projectId: project.id, schedule: (agentDef as any).schedule ?? '0 * * * *' },
          create: { name, scriptId: script.id, userId: user.id, projectId: project.id, enabled: isAgentEnabled, schedule: (agentDef as any).schedule ?? '0 * * * *' }
        });

        if (workerRole) {
          await this.prisma.agentRole.upsert({
            where: {
              agentId_roleId: {
                agentId: agent.id,
                roleId: workerRole.id
              }
            },
            update: {},
            create: {
              agentId: agent.id,
              roleId: workerRole.id
            }
          });
        }

        count++;
      }
      logger.info(`[CuratorRequestProcessor] Synced ${count} agents.`);

      // Clean up any lingering active/pending requests for disabled agents
      try {
        const disabledAgents = await this.prisma.agent.findMany({
          where: { enabled: false },
          select: { id: true, name: true, scriptId: true }
        });
        const enabledCount = await this.prisma.agent.count({ where: { enabled: true } });

        if (enabledCount === 0) {
          logger.info(`[CuratorRequestProcessor] All agents are disabled. Cancelling all active/pending/waiting requests in DB...`);
          await this.prisma.request.updateMany({
            where: {
              status: { in: ['NEW', 'WAITING', 'WAITING_FOR_USER', 'WAITING_FOR_EVENT', 'PAUSED'] }
            },
            data: { status: 'CANCELLED', lockedBy: null, lockedAt: null }
          });
        } else {
          for (const da of disabledAgents) {
            const conditions: any[] = [{ agentId: da.id }, { agentId: da.name }];
            if (da.scriptId) conditions.push({ scriptId: da.scriptId });

            const relatedReqs = await this.prisma.request.findMany({
              where: { OR: conditions },
              select: { conversationId: true }
            });
            const convIds = Array.from(new Set(relatedReqs.map((r: any) => r.conversationId).filter(Boolean)));
            if (convIds.length > 0) {
              conditions.push({ conversationId: { in: convIds } });
            }

            await this.prisma.request.updateMany({
              where: {
                OR: conditions,
                status: { in: ['NEW', 'WAITING', 'WAITING_FOR_USER', 'WAITING_FOR_EVENT', 'PAUSED'] }
              },
              data: { status: 'CANCELLED', lockedBy: null, lockedAt: null }
            });
          }
        }
      } catch (cleanErr) {
        logger.warn('[CuratorRequestProcessor] Error cleaning up requests for disabled agents:', cleanErr);
      }
    } catch (err) {
      logger.error('[CuratorRequestProcessor] Failed to sync agents to DB:', err);
    }
  }

  private lastScheduleMinuteBucket: number = 0;

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info(`[CuratorRequestProcessor] Worker ${this.workerId} stopped.`);
    }
  }

  private async pollScheduledAgents() {
    const now = new Date();
    const currentMinuteBucket = Math.floor(now.getTime() / 60000);
    if (this.lastScheduleMinuteBucket === currentMinuteBucket) {
      return; // Already evaluated schedules in this minute
    }
    this.lastScheduleMinuteBucket = currentMinuteBucket;

    try {
      const enabledAgents = await this.prisma.agent.findMany({
        where: { enabled: true },
        include: { script: true }
      });

      for (const agent of enabledAgents) {
        if (!agent.schedule || !agent.script?.ast) continue;

        // Check if lastPolledAt was in the same minute
        if (agent.lastPolledAt && Math.floor(new Date(agent.lastPolledAt).getTime() / 60000) === currentMinuteBucket) {
          continue;
        }

        if (!isScheduleDue(agent.schedule, now)) {
          continue;
        }

        // Avoid queuing duplicate if a request for this agent is already in flight
        const activeRequest = await this.prisma.request.findFirst({
          where: {
            agentId: agent.id,
            status: { in: ['NEW', 'WAITING'] }
          }
        });
        if (activeRequest) continue;

        // Update lastPolledAt
        await this.prisma.agent.update({
          where: { id: agent.id },
          data: { lastPolledAt: now }
        });

        // Ensure conversation exists
        let conversation = await this.prisma.conversation.findFirst({
          where: { userId: agent.userId, projectId: agent.projectId }
        });
        if (!conversation) {
          conversation = await this.prisma.conversation.create({
            data: { userId: agent.userId, projectId: agent.projectId }
          });
        }

        const newReq = await this.createValidatedRequest({
          data: {
            userId: agent.userId,
            projectId: agent.projectId,
            conversationId: conversation.id,
            scriptId: agent.scriptId,
            agentId: agent.id,
            status: 'NEW',
            pendingDependencies: 0,
            ast: agent.script.ast,
            scheduledAt: now
          }
        });

        logger.info(`[CuratorRequestProcessor] Scheduled agent '${agent.name}' triggered on schedule '${agent.schedule}' (Request #${newReq.id})`);
        this.emit('log', { message: `[Curator] Scheduled agent '${agent.name}' triggered on schedule '${agent.schedule}' (Request #${newReq.id})` });
        this.emit('database_change', { tables: ['requests', 'agents'] });
      }
    } catch (err: any) {
      logger.error('[CuratorRequestProcessor] Error polling scheduled agents:', err);
    }
  }

  /**
   * Returns how many new tasks can be started without exceeding the safe concurrency threshold.
   */
  public getAvailableConcurrencySlots(): number {
    if (Date.now() < this.backoffUntil) return 0;
    return Math.max(0, this.maxConcurrency - this.activeTasks);
  }

  /**
   * Recovers stale or abandoned tasks locked by a crashed/restarted worker > 5 mins ago.
   */
  private async unlockStaleRequests() {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const stale = await this.prisma.request.updateMany({
        where: {
          status: 'WAITING',
          lockedBy: { not: null },
          lockedAt: { lte: fiveMinutesAgo },
          pendingDependencies: 0
        },
        data: {
          status: 'NEW',
          lockedBy: null,
          lockedAt: null
        }
      });
      if (stale.count > 0) {
        logger.warn(`[CuratorRequestProcessor] Recovered ${stale.count} stale/abandoned requests.`);
      }
    } catch (_) {}
  }

  private async pollRequests() {
    if (this.isPolling) return;
    this.isPolling = true;
    try {
      if (Date.now() < this.backoffUntil) {
        return;
      }

      await this.unlockStaleRequests();

      // 0. Poll enabled scheduled agents if due
      await this.pollScheduledAgents();

      // 1. Wake up requests that were WAITING_FOR_USER and just received a response
      const userRespondedRequests = await this.prisma.request.findMany({
        where: {
          status: 'WAITING',
          responses: { some: {} } // Has at least one response
        },
        include: { responses: { orderBy: { createdAt: 'desc' }, take: 1 } },
        take: 5
      });

      for (const req of userRespondedRequests) {
        // Check targetUserId — if set, only a response from that specific user counts
        const targetUserId = (req.context as any)?.targetUserId;
        if (targetUserId) {
          const latestResponse = (req as any).responses?.[0];
          if (!latestResponse || latestResponse.userId !== targetUserId) {
            continue; // Not yet answered by the right player
          }
        }

        logger.info(`[CuratorRequestProcessor] Request ${req.id} received human input. Resuming...`);
        // We lock it briefly so another worker doesn't double-complete it
        await this.prisma.request.update({
          where: { id: req.id },
          data: { status: 'WAITING', lockedBy: this.workerId, lockedAt: new Date() }
        });
        // This invokes the same merge-and-notify flow as if an agent finished!
        await this.completeRequest(req.id, 'COMPLETED');
      }

      // 2. Check available concurrency capacity before taking new tasks
      const availableSlots = this.getAvailableConcurrencySlots();
      if (availableSlots <= 0) {
        return;
      }

      // 3. Poll for NEW requests matching current capacity
      const requests = await this.prisma.request.findMany({
        where: {
          status: 'NEW',
          pendingDependencies: { lte: 0 },
          scheduledAt: { lte: new Date() }
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        take: availableSlots
      });

      if (!requests || requests.length === 0) return;

      const lockedRequests: any[] = [];
      for (const req of requests) {
        const updated = await this.prisma.request.updateMany({
          where: { id: req.id, status: 'NEW' },
          data: { status: 'WAITING', lockedBy: this.workerId, lockedAt: new Date() }
        });
        if (updated.count > 0) lockedRequests.push(req);
      }

      // 4. Dispatch tasks asynchronously within safe concurrency limits
      for (const req of lockedRequests) {
        this.runTask(req);
      }
    } catch (error: any) {
      if (error?.message?.includes('pool failed to retrieve a connection') || error?.message?.includes('Connection pool exhausted')) {
        logger.warn(`[CuratorRequestProcessor] Database connection pool saturated. Backing off for 5s to reserve web headroom...`);
        this.backoffUntil = Date.now() + 5000;
      } else {
        logger.error('[CuratorRequestProcessor] Error polling requests:', error);
      }
    } finally {
      this.isPolling = false;
    }
  }

  private async runTask(req: any) {
    this.activeTasks++;
    try {
      // Yield to the Node.js event loop before starting heavy task to let web requests process smoothly
      await new Promise(resolve => setImmediate(resolve));
      await this.processRequest(req);
    } catch (err) {
      logger.error(`[CuratorRequestProcessor] Task execution error for request ${req.id}:`, err);
    } finally {
      this.activeTasks = Math.max(0, this.activeTasks - 1);
      // Immediately evaluate next pending tasks if capacity is available
      setImmediate(() => this.pollRequests());
    }
  }

  private async processRequest(request: any) {
    logger.info(`[CuratorRequestProcessor] Processing request ${request.id}`);
    this.emit('request_start', { requestId: request.id });
    try {
      const req = await this.prisma.request.findUnique({
        where: { id: request.id },
        include: { user: true }
      });
      if (!req) throw new Error(`Request ${request.id} not found`);

      let agent: any = null;
      try {
        const enabledCount = await this.prisma.agent.count({ where: { enabled: true } });
        if (enabledCount === 0) {
          logger.info(`[CuratorRequestProcessor] Cancelling request ${req.id}: all agents are disabled.`);
          await this.prisma.request.update({
            where: { id: req.id },
            data: { status: 'CANCELLED', lockedBy: null, lockedAt: null }
          });
          this.emit('request_done', { requestId: req.id, success: false, status: 'CANCELLED' });
          return;
        }

        if (req.agentId) {
          agent = await this.prisma.agent.findFirst({
            where: { OR: [{ id: req.agentId }, { name: req.agentId }] }
          });
        }
        if (!agent && req.scriptId) {
          agent = await this.prisma.agent.findFirst({ where: { scriptId: req.scriptId } });
        }
        if (!agent && req.conversationId) {
          const relatedAgentReq = await this.prisma.request.findFirst({
            where: { conversationId: req.conversationId, agentId: { not: null } },
            select: { agentId: true }
          });
          if (relatedAgentReq?.agentId) {
            agent = await this.prisma.agent.findFirst({
              where: { OR: [{ id: relatedAgentReq.agentId }, { name: relatedAgentReq.agentId }] }
            });
          }
        }

        if (!agent && req.ast?.name) {
          agent = await this.prisma.agent.findFirst({
            where: {
              OR: [
                { name: req.ast.name },
                { name: { contains: req.ast.name.replace(/^(seq|pipeline)_scrape_/, '') } }
              ]
            }
          });
        }

        if (agent && agent.enabled === false) {
          logger.info(`[CuratorRequestProcessor] Cancelling request ${req.id}: associated agent '${agent.name}' is disabled.`);
          await this.prisma.request.update({
            where: { id: req.id },
            data: { status: 'CANCELLED', lockedBy: null, lockedAt: null }
          });
          this.emit('request_done', { requestId: req.id, success: false, status: 'CANCELLED' });
          return;
        }
      } catch (_) {}

      const validation = validateCuratorAst(req.ast);
      if (!validation.valid) {
        const message = `Invalid Curator AST: ${validation.errors.join('; ')}`;
        logger.error(`[CuratorRequestProcessor] Request ${request.id} rejected: ${message}`);
        await this.saveResponse(req, `ERROR: ${message}`);
        await this.prisma.request.update({ where: { id: request.id }, data: { status: 'FAILED', lockedBy: null, lockedAt: null } });
        this.emit('request_done', { requestId: request.id, success: false, error: message });
        return;
      }
      const ast: CuratorAstNode = validation.node!;

      await curatorContext.run({
        userId: req.userId,
        projectId: req.projectId || 1,
        userIds: [req.userId],
        projectIds: [req.projectId || 1],
        sessionId: req.conversationId,
        requestId: req.id,
        prisma: this.prisma
      }, async () => {
        if (!ast) {
          await this.completeRequest(request.id, 'COMPLETED');
          return;
        }

        const nodeTypes = ['Curator_Agent', 'Curator_Sequential', 'Curator_Parallel', 'Curator_Join', 'Curator_Tool', 'Curator_Script', 'Curator_Route', 'Curator_HumanInput', 'Curator_Graph', 'Curator_AgentRef', 'Curator_SetState', 'Curator_Interrupt', 'Curator_EmitEvent', 'Curator_WaitEvent', 'Curator_Assign', 'Curator_IfElse', 'Curator_While', 'Curator_ForEach'];
        if (nodeTypes.includes(ast.type)) {
          switch (ast.type) {
            case 'Curator_Agent': return await this.executeAgent(ast as CuratorAgentNode, req);
            case 'Curator_Sequential': return await this.handleSequential(ast as CuratorSequentialNode, req);
            case 'Curator_Parallel': return await this.handleParallel(ast as CuratorParallelNode, req);
            case 'Curator_Join': return await this.handleJoin(ast as CuratorJoinNode, req);
            case 'Curator_Tool': return await this.handleTool(ast as CuratorToolNode, req);
            case 'Curator_Script': return await this.handleScript(ast as CuratorScriptNode, req);
            case 'Curator_Route': return await this.handleRoute(ast as CuratorRouteNode, req);
            case 'Curator_HumanInput': return await this.handleHumanInput(ast as any, req);
            case 'Curator_WaitEvent': return await this.handleWaitEvent(ast as any, req);
            case 'Curator_Graph': return await this.handleGraph(ast as CuratorGraphNode, req);
            case 'Curator_AgentRef': return await this.handleAgentRef(req, ast as any, req.context);
            case 'Curator_SetState': return await this.handleSetState(ast as any, req);
            case 'Curator_Interrupt': return await this.handleInterrupt(ast as any, req);
            case 'Curator_EmitEvent': return await this.handleEmitEvent(ast as any, req);
            case 'Curator_Assign': return await this.handleAssign(ast as any, req);
            case 'Curator_IfElse': return await this.handleIfElse(ast as any, req);
            case 'Curator_While': return await this.handleWhile(ast as any, req);
            case 'Curator_ForEach': return await this.handleForEach(ast as any, req);
            default:
              logger.warn(`[CuratorRequestProcessor] Node type ${ast.type} not implemented.`);
              await this.completeRequest(req.id, 'COMPLETED');
          }
        } else {
          logger.warn(`[CuratorRequestProcessor] Request ${req.id} has unknown AST type: ${(ast as any).type}. Skipping.`);
          await this.prisma.request.update({ where: { id: req.id }, data: { status: 'SKIPPED', lockedBy: null, lockedAt: null } });
        }
      });
    } catch (error: any) {
      const msg = error.message || String(error);
      const retryMatch = msg.match(/Please retry in ([\d\.]+)s/);
      const isRateLimit = msg.includes('429') || msg.includes('Quota exceeded') || !!retryMatch;
      const MAX_RETRIES = 5;

      const req = await this.prisma.request.findUnique({ where: { id: request.id } });
      if (isRateLimit && req && req.retryCount < MAX_RETRIES) {
        let delayMs = 5000 * Math.pow(2, req.retryCount);
        if (retryMatch) delayMs = parseFloat(retryMatch[1]) * 1000 + 1000;
        const scheduledAt = new Date(Date.now() + delayMs);
        logger.info(`[CuratorRequestProcessor] Rate limit. Rescheduling request ${request.id} in ${Math.round(delayMs/1000)}s (Attempt ${req.retryCount + 1}/${MAX_RETRIES})`);
        await this.prisma.request.update({ where: { id: request.id }, data: { status: 'NEW', lockedBy: null, lockedAt: null, retryCount: req.retryCount + 1, scheduledAt } });
        return;
      }

      logger.error(`[CuratorRequestProcessor] Failed request ${request.id}:`, error);
      try {
        await this.saveResponse(request, `ERROR: ${msg}`);
      } catch (dbErr) {
        logger.error(`[CuratorRequestProcessor] Failed to write error response:`, dbErr);
      }
      await this.prisma.request.update({ where: { id: request.id }, data: { status: 'FAILED', lockedBy: null, lockedAt: null } });
    }
  }

  private async handleEmitEvent(node: any, req: any) {
    logger.info(`[CuratorRequestProcessor] Emitting event: ${node.eventName}`);
    
    // Evaluate dynamic payload
    let payload = node.payload ?? req.context?.input;
    if (typeof node.payload === 'string' && node.payload.startsWith('(') && node.payload.endsWith('(context)')) {
      payload = await this.evaluateExpressionAsync(node.payload, req);
    }
    
    // Evaluate dynamic targetAgentId
    let targetAgentId = node.targetAgentId;
    if (typeof targetAgentId === 'string') {
      targetAgentId = await this.evaluateExpressionAsync(targetAgentId, req);
    }

    const subscriptions = await this.prisma.eventSubscription.findMany({
      where: { 
        eventName: node.eventName, 
        isActive: true,
        OR: [
          { conversationId: req.conversationId },
          { conversationId: null }
        ]
      },
      include: { agentWorkflow: true }
    });

    let spawnedCount = 0;
    for (const sub of subscriptions) {
      if (targetAgentId && sub.agentWorkflow?.agentId !== targetAgentId) {
        continue;
      }

      const targetAst = sub.workflowAst || sub.agentWorkflow?.ast;
      if (!targetAst) continue;

      await this.createValidatedRequest({
        data: {
          userId: sub.userId,
          projectId: sub.projectId,
          conversationId: req.conversationId,
          status: 'NEW',
          ast: targetAst as any,
          context: { input: payload, eventName: node.eventName }
        }
      });
      spawnedCount++;
    }
    
    // Wake up WAITING_FOR_EVENT requests
    const waitingRequests = await this.prisma.request.findMany({
      where: {
        conversationId: req.conversationId,
        status: 'WAITING_FOR_EVENT'
      }
    });

    let wokenCount = 0;
    for (const waitReq of waitingRequests) {
      const ctx = waitReq.context as any;
      if (ctx?.waitEvent === node.eventName) {
        logger.info(`[CuratorRequestProcessor] Waking up request ${waitReq.id} waiting for event ${node.eventName}`);
        
        let newState = {};
        if (ctx.payloadAlias) {
           newState = { [ctx.payloadAlias]: payload };
        }
        
        const updatedContext = { ...ctx };
        delete updatedContext.waitEvent;
        delete updatedContext.payloadAlias;
        if (ctx.payloadAlias) {
           updatedContext.state = { ...(updatedContext.state || {}), ...newState };
           
           const conv = await this.prisma.conversation.findUnique({ where: { id: waitReq.conversationId } });
           const currentConvState = this.getConversationState(conv);
           await this.updateConversationState(waitReq.conversationId, { ...currentConvState, ...newState });
        }
        
        await this.prisma.request.update({
          where: { id: waitReq.id },
          data: { status: 'NEW', context: updatedContext }
        });
        wokenCount++;
      }
    }

    await this.saveResponse(req, `Emitted event '${node.eventName}' to ${spawnedCount} listeners. Woke up ${wokenCount} waiting workflows.`);
    await this.completeRequest(req.id, 'COMPLETED');
  }

  private async handleWaitEvent(ast: any, req: any) {
    logger.info(`[CuratorRequestProcessor] Request ${req.id} paused, waiting for event '${ast.eventName}'.`);
    const updatedContext = { ...(req.context || {}), waitEvent: ast.eventName, payloadAlias: ast.payloadAlias };
    await this.prisma.request.update({
      where: { id: req.id },
      data: { status: 'WAITING_FOR_EVENT', context: updatedContext }
    });
  }

  /**
   * Parses a node's `scheduledAt` field into a Date for use in Request.scheduledAt.
   * Supports:
   *  - ISO 8601 strings: "2026-12-25T09:00:00Z"
   *  - Human duration strings: "in 5 minutes", "in 2 hours", "in 1 day"
   *  - undefined/null → returns undefined (execute immediately)
   */
  private resolveScheduledAt(nodeAst: any): Date | undefined {
    const raw: string | undefined = nodeAst?.scheduledAt;
    if (!raw) return undefined;
    const lower = raw.trim().toLowerCase();
    const inMatch = lower.match(/^in\s+(\d+(?:\.\d+)?)\s*(second|minute|hour|day|week)s?$/);
    if (inMatch) {
      const amount = parseFloat(inMatch[1]);
      const unit = inMatch[2];
      const msMap: Record<string, number> = {
        second: 1000,
        minute: 60_000,
        hour: 3_600_000,
        day: 86_400_000,
        week: 604_800_000
      };
      return new Date(Date.now() + amount * (msMap[unit] || 0));
    }
    // Try ISO parse
    const d = new Date(raw);
    return isNaN(d.getTime()) ? undefined : d;
  }

  private async handleSequential(ast: CuratorSequentialNode, req: any) {
    const subAgents = ast.subAgents;
    if (!subAgents || subAgents.length === 0) { await this.completeRequest(req.id, 'COMPLETED'); return; }

    let currentNotifyId = req.notifyId;
    for (let i = subAgents.length - 1; i >= 0; i--) {
      const isFirst = i === 0;
      let nodeAst = subAgents[i] as any;
      if (isFirst && ast.prompt && !nodeAst.prompt) nodeAst.prompt = ast.prompt;

      const newReq = await this.createValidatedRequest({
        data: {
          userId: req.userId,
          projectId: req.projectId,
          agentId: req.agentId,
          scriptId: req.scriptId,
          conversationId: req.conversationId,
          status: 'NEW',
          pendingDependencies: isFirst ? 0 : 1,
          notifyId: currentNotifyId,
          ast: nodeAst,
          priority: nodeAst.priority ?? 0,
          scheduledAt: this.resolveScheduledAt(nodeAst) ?? null
        }
      });
      currentNotifyId = newReq.id;
    }
    // The last child spawned assumes responsibility for notifying our parent.
    await this.completeRequest(req.id, 'COMPLETED', true);
  }

  private async handleParallel(ast: CuratorParallelNode, req: any) {
    const subAgents = ast.subAgents;
    if (!subAgents || subAgents.length === 0) { await this.completeRequest(req.id, 'COMPLETED'); return; }

    const joinReq = await this.createValidatedRequest({
      data: {
        userId: req.userId,
        projectId: req.projectId,
        agentId: req.agentId,
        scriptId: req.scriptId,
        conversationId: req.conversationId,
        status: 'NEW',
        pendingDependencies: subAgents.length,
        notifyId: req.notifyId,
        ast: { type: 'Curator_Join', name: `${ast.name || 'parallel'}_join` }
      }
    });

    for (const sub of subAgents) {
      let nodeAst = sub as any;
      if (ast.prompt && !nodeAst.prompt) nodeAst.prompt = ast.prompt;
      await this.createValidatedRequest({
        data: {
          userId: req.userId,
          projectId: req.projectId,
          agentId: req.agentId,
          scriptId: req.scriptId,
          conversationId: req.conversationId,
          status: 'NEW',
          pendingDependencies: 0,
          notifyId: joinReq.id,
          ast: nodeAst,
          priority: nodeAst.priority ?? 0,
          scheduledAt: this.resolveScheduledAt(nodeAst) ?? null
        }
      });
    }
    // The join node assumes responsibility for notifying our parent.
    await this.completeRequest(req.id, 'COMPLETED', true);
  }

  private async handleJoin(ast: CuratorJoinNode, req: any) {
    logger.info(`[CuratorRequestProcessor] Executing Join Node for request ${req.id}`);
    const children = await this.prisma.request.findMany({
      where: { notifyId: req.id, status: 'COMPLETED' },
      include: { responses: { orderBy: { createdAt: 'desc' }, take: 1 } }
    });
    const combinedTexts = children.map((c: any) => c.responses[0]?.content || '').join('\n\n---\n\n');
    await this.saveResponse(req, `[Joined Output]\n${combinedTexts}`);
    await this.completeRequest(req.id, 'COMPLETED');
  }

  private async handleRoute(ast: CuratorRouteNode, req: any) {
    const context = req.context || {};
    
    // Phase 1: Evaluate the router logic
    if (!context.routeDecided) {
      logger.info(`[CuratorRequestProcessor] Route Node (Phase 1) for request ${req.id} - inserting router node.`);
      
      // Inherit the prompt into the router if applicable
      let routerAst = { ...ast.router } as any;

      await this.createValidatedRequest({
        data: {
          userId: req.userId,
          conversationId: req.conversationId,
          status: 'NEW',
          pendingDependencies: 0,
          notifyId: req.id, // Will wake up this Curator_Route request
          ast: routerAst
        }
      });

      // Put this node to sleep waiting for the router decision
      context.routeDecided = true;
      await this.prisma.request.update({
        where: { id: req.id },
        data: {
          pendingDependencies: 1,
          context,
          status: 'NEW', // Keep NEW so it gets picked up again
          lockedBy: null,
          lockedAt: null
        }
      });
      return;
    }

    // Phase 2: Execute the sub-agent based on the router's decision
    logger.info(`[CuratorRequestProcessor] Route Node (Phase 2) for request ${req.id} - making decision.`);
    
    let decision = String(context.input || '').trim();
    try {
      const parsed = JSON.parse(decision);
      if (parsed && typeof parsed === 'object') {
        decision = parsed.route || parsed.output || parsed.text || decision;
      }
    } catch (e) {}

    logger.info(`[CuratorRequestProcessor] Route decision: '${decision}'`);

    const targetAst = ast.subAgents[decision] || (ast.defaultRoute ? ast.subAgents[ast.defaultRoute] : null);

    if (!targetAst) {
      logger.warn(`[CuratorRequestProcessor] Route Node ${req.id} decision '${decision}' matched no subAgent and no defaultRoute.`);
      await this.saveResponse(req, `[Route Failed: No Match for '${decision}']`);
      await this.completeRequest(req.id, 'COMPLETED');
      return;
    }

    // Pass the input along to the target AST if it needs it
    let nodeAst = { ...targetAst } as any;

    // Spawn the subAgent and connect it directly to the parent's notifyId
    await this.prisma.request.create({
      data: {
        userId: req.userId,
        conversationId: req.conversationId,
        status: 'NEW',
        pendingDependencies: 0,
        notifyId: req.notifyId,
        ast: nodeAst,
        context: { input: req.context?.input }
      }
    });

    await this.saveResponse(req, `[Route Decided: ${decision}]`);
    // The routed child assumes responsibility for notifying our parent.
    await this.completeRequest(req.id, 'COMPLETED', true);
  }

  private async handleGraph(ast: CuratorGraphNode, req: any) {
    const context = req.context || {};
    let activeNode = context.activeNode || ast.startNode;
    let waitingFor = context.waitingFor;
    let stateData = context.stateData || context.input || '';

    // Phase 1: Wake up and figure out next transition
    if (waitingFor) {
      if (waitingFor === 'NODE') {
        // A state node just finished. Save its output to stateData.
        stateData = req.context?.input || stateData;
        logger.info(`[CuratorRequestProcessor] Graph Node ${req.id} finished state '${activeNode}'.`);
      } else if (waitingFor === 'ROUTER') {
        // A conditional router just finished evaluating the state.
        // Its output was merged into Conversation.state. If it returned a raw string,
        // completeRequest merged it into the 'output' property.
        let routeDest = '';
        try {
          const parsed = JSON.parse(req.context?.input || '{}');
          routeDest = (parsed.output || req.context?.input)?.trim() || '';
        } catch(e) {
          routeDest = req.context?.input?.trim() || '';
        }

        logger.info(`[CuratorRequestProcessor] Graph Node ${req.id} routed to '${routeDest}'.`);
        
        activeNode = routeDest;
      }

      // If we just finished a state node, look for its edge transition
      if (waitingFor === 'NODE') {
        const edge = ast.edges ? ast.edges[activeNode] : null;
        
        if (!edge || edge === '__end__') {
          logger.info(`[CuratorRequestProcessor] Graph Node ${req.id} reached terminal state.`);
          await this.saveResponse(req, stateData);
          await this.completeRequest(req.id, 'COMPLETED');
          return;
        }

        if (typeof edge === 'string') {
          logger.info(`[CuratorRequestProcessor] Graph Node ${req.id} statically transitioning to '${edge}'.`);
          activeNode = edge;
        } else {
          logger.info(`[CuratorRequestProcessor] Graph Node ${req.id} spawning conditional router for '${activeNode}'.`);
          await this.createValidatedRequest({
            data: {
              userId: req.userId,
              conversationId: req.conversationId,
              status: 'NEW',
              pendingDependencies: 0,
              notifyId: req.id,
              ast: edge as any,
              context: { input: stateData }
            }
          });

          await this.prisma.request.update({
            where: { id: req.id },
            data: {
              pendingDependencies: 1,
              context: { ...context, activeNode, stateData, waitingFor: 'ROUTER' },
              status: 'NEW',
              lockedBy: null,
              lockedAt: null
            }
          });
          return;
        }
      }

      // Clear waitingFor since we are about to spawn a new NODE
      waitingFor = null;
    }

    // Phase 2: Execute the active state node
    if (!waitingFor) {
      if (activeNode === '__end__') {
        logger.info(`[CuratorRequestProcessor] Graph Node ${req.id} reached __end__ before execution.`);
        await this.saveResponse(req, stateData);
        await this.completeRequest(req.id, 'COMPLETED');
        return;
      }

      const targetAst = ast.nodes[activeNode];
      if (!targetAst) {
        logger.warn(`[CuratorRequestProcessor] Graph Node ${req.id} tried to enter unknown state '${activeNode}'.`);
        await this.saveResponse(req, `[Graph Failed: Unknown state '${activeNode}']\n${stateData}`);
        await this.completeRequest(req.id, 'COMPLETED');
        return;
      }

      logger.info(`[CuratorRequestProcessor] Graph Node ${req.id} executing state '${activeNode}'.`);
      
      let nodeAst = { ...targetAst } as any;

      await this.createValidatedRequest({
        data: {
          userId: req.userId,
          conversationId: req.conversationId,
          status: 'NEW',
          pendingDependencies: 0,
          notifyId: req.id,
          ast: nodeAst,
          context: { input: stateData } // Pass stateData into the node
        }
      });

      await this.prisma.request.update({
        where: { id: req.id },
        data: {
          pendingDependencies: 1,
          context: { ...context, activeNode, stateData, waitingFor: 'NODE' },
          status: 'NEW',
          lockedBy: null,
          lockedAt: null
        }
      });
      return;
    }
  }

  private async handleHumanInput(ast: any, req: any) {
    logger.info(`[CuratorRequestProcessor] Request ${req.id} paused, waiting for human input from ${ast.targetUserId ? `user ${ast.targetUserId}` : 'any user'} (${ast.inputType || 'text'}).`);
    // Store targetUserId in context so the poll loop can enforce it
    const updatedContext = { ...(req.context || {}), targetUserId: ast.targetUserId ?? null };
    await this.prisma.request.update({
      where: { id: req.id },
      data: { status: 'WAITING_FOR_USER', context: updatedContext }
    });
  }

  private async handleAgentRef(req: any, ast: any, context: any) {
    if (context.spawnedChild) {
      // Phase 2: Child finished. Output is in context.input.
      const outputStr = typeof context.input === 'string' ? context.input : JSON.stringify(context.input || {});
      await this.saveResponse(req, outputStr);
      await this.completeRequest(req.id, 'COMPLETED');
      return;
    }

    if (!ast.agentName) {
      await this.saveResponse(req, `[Agent Error] Missing agentName parameter`);
      await this.completeRequest(req.id, 'COMPLETED');
      return;
    }

    logger.info(`[CuratorRequestProcessor] Executing AgentRef '${ast.agentName}' for request ${req.id}`);
    
    // Look up the agent AST from the database
    const agentDef = await this.prisma.agent.findUnique({
      where: { name: ast.agentName }
    });

    if (!agentDef) {
      logger.error(`[CuratorRequestProcessor] Agent '${ast.agentName}' not found in DB.`);
      await this.saveResponse(req, `[Agent Error] Agent '${ast.agentName}' not found.`);
      await this.completeRequest(req.id, 'COMPLETED');
      return;
    }

    let agentAst: any = null;
    
    if (agentDef.ast) {
      agentAst = typeof agentDef.ast === 'string' ? JSON.parse(agentDef.ast) : agentDef.ast;
    } else if (agentDef.sourceCode) {
      logger.info(`[CuratorRequestProcessor] Evaluating sourceCode for agent '${ast.agentName}'`);
      const sandbox = { console, input: context.input || '' };
      const vmContext = vm.createContext(sandbox);
      try {
        const output = vm.runInContext(agentDef.sourceCode, vmContext);
        if (typeof output === 'string') {
          agentAst = JSON.parse(output);
        } else {
          agentAst = output;
        }
      } catch (err: any) {
        logger.error(`[CuratorRequestProcessor] Failed to evaluate agent sourceCode for '${ast.agentName}':`, err);
        await this.saveResponse(req, `[Agent Error] Evaluation failed: ${err.message}`);
        await this.completeRequest(req.id, 'COMPLETED');
        return;
      }
    }

    if (!agentAst) {
      logger.error(`[CuratorRequestProcessor] Agent '${ast.agentName}' has no valid AST or sourceCode.`);
      await this.saveResponse(req, `[Agent Error] Agent '${ast.agentName}' has no valid AST.`);
      await this.completeRequest(req.id, 'COMPLETED');
      return;
    }

    // Spawn the loaded AST as a child request, inheriting the input context
    await this.createValidatedRequest({
      data: {
        userId: req.userId,
        conversationId: req.conversationId,
        status: 'NEW',
        pendingDependencies: 0,
        notifyId: req.id,
        ast: agentAst,
        context: { input: context.input }
      }
    });

    // Put this request to sleep waiting for the child to complete
    context.spawnedChild = true;
    await this.prisma.request.update({
      where: { id: req.id },
      data: {
        pendingDependencies: 1,
        status: 'NEW',
        lockedBy: null,
        lockedAt: null,
        context
      }
    });
  }

  private async handleScript(ast: CuratorScriptNode, req: any) {
    if (req.context?.spawnedChild) {
      // Phase 2: Child finished. Output is in req.context.input.
      const outputStr = typeof req.context.input === 'string' ? req.context.input : JSON.stringify(req.context.input || {});
      await this.saveResponse(req, outputStr);
      await this.completeRequest(req.id, 'COMPLETED');
      return;
    }

    logger.info(`[CuratorRequestProcessor] Executing Script Node (${ast.language || 'javascript'}) for request ${req.id}`);
    const sandbox = {
      console,
      input: req.context?.input || '',
      context: req.context || {},
      ...coffeeAstVerbs,
    };
    const context = vm.createContext(sandbox);
    try {
      let codeToExecute = ast.code;
      if (ast.language === 'coffeescript') {
        const coffee = (await import('coffeescript')).default;
        codeToExecute = coffee.compile(ast.code, { bare: true, header: false });
      }
      const output = vm.runInContext(codeToExecute, context);
      
      const nodeTypes = ['Curator_Agent', 'Curator_Sequential', 'Curator_Parallel', 'Curator_Join', 'Curator_Tool', 'Curator_Script', 'Curator_Route', 'Curator_HumanInput', 'Curator_Graph', 'Curator_AgentRef', 'Curator_SetState', 'Curator_EmitEvent', 'Curator_WaitEvent', 'Curator_Interrupt', 'Curator_Assign', 'Curator_IfElse', 'Curator_While', 'Curator_ForEach'];
      if (output && typeof output === 'object' && output.type && nodeTypes.includes(output.type)) {
        logger.info(`[CuratorRequestProcessor] Script generated a valid AST node of type ${output.type}. Spawning as child...`);
        // Spawn the dynamic AST
        await this.createValidatedRequest({
          data: {
            ast: output,
            context: { ...req.context, spawnedChild: false, input: req.context?.input },
            projectId: req.projectId,
            conversationId: req.conversationId,
            userId: req.userId || 1,
            status: 'NEW',
            pendingDependencies: 0,
            notifyId: req.id
          }
        });

        // Set parent to WAITING
        await this.prisma.request.update({
          where: { id: req.id },
          data: { status: 'WAITING', lockedBy: null, lockedAt: null, pendingDependencies: 1, context: { ...req.context, spawnedChild: true } }
        });
        return;
      }
      
      const result = typeof output === 'string' ? output : JSON.stringify(output);
      await this.saveResponse(req, result);
      await this.completeRequest(req.id, 'COMPLETED');
    } catch(e: any) {
      const result = `[Script Error] ${e.message}`;
      await this.saveResponse(req, result);
      await this.completeRequest(req.id, 'COMPLETED');
    }
  }

  private async resolveActorPermissions(actor: { userId?: string; agentId?: string }): Promise<Set<string>> {
    const permissions = new Set<string>();
    const visitedRoles = new Set<string>();
    const roleQueue: string[] = [];

    try {
      if (actor.userId) {
        const userRoles = await this.prisma.userRole.findMany({
          where: { userId: actor.userId },
          select: { roleId: true }
        });
        for (const ur of userRoles) roleQueue.push(ur.roleId);
      }

      if (actor.agentId) {
        const agentRoles = await this.prisma.agentRole.findMany({
          where: { agentId: actor.agentId },
          select: { roleId: true }
        });
        for (const ar of agentRoles) roleQueue.push(ar.roleId);
      }

      // Recursively traverse role inheritance graph (nested subroles)
      while (roleQueue.length > 0) {
        const roleId = roleQueue.shift()!;
        if (visitedRoles.has(roleId)) continue;
        visitedRoles.add(roleId);

        // Fetch role's permissions
        const rolePerms = await this.prisma.rolePermission.findMany({
          where: { roleId },
          include: { permission: true }
        });
        for (const rp of rolePerms) {
          if (rp.permission?.name) {
            permissions.add(rp.permission.name);
            if (rp.permission.toolName) permissions.add(`tool:${rp.permission.toolName}:execute`);
          }
        }

        // Fetch inherited subroles
        const inherited = await this.prisma.roleInheritance.findMany({
          where: { parentId: roleId },
          select: { subRoleId: true }
        });
        for (const inh of inherited) {
          if (!visitedRoles.has(inh.subRoleId)) {
            roleQueue.push(inh.subRoleId);
          }
        }
      }
    } catch (err) {
      logger.error('[CuratorRequestProcessor] Error resolving actor permissions:', err);
    }

    return permissions;
  }

  private async checkToolAccess(req: any, toolName: string, tool: any): Promise<{ allowed: boolean; requiresConfirmation: boolean; reason?: string }> {
    const accessLevel = (tool as any).accessLevel || 'safe_write';
    const requiresConfirmation = (tool as any).requiresConfirmation || accessLevel === 'destructive';

    // If confirmation is needed and not already confirmed in request context:
    if (requiresConfirmation && req.context?.confirmed !== true) {
      return {
        allowed: false,
        requiresConfirmation: true,
        reason: `Tool '${toolName}' (${accessLevel}) requires user confirmation before execution.`
      };
    }

    // If there are RBAC permissions configured in database, verify them
    try {
      const totalPermissionsCount = await this.prisma.permission.count();
      if (totalPermissionsCount > 0) {
        const actorPerms = await this.resolveActorPermissions({ userId: req.userId, agentId: req.agentId });
        if (actorPerms.size > 0) {
          const hasDirectPerm = actorPerms.has(`tool:${toolName}:execute`) || actorPerms.has('*') || actorPerms.has('admin');
          if (!hasDirectPerm) {
            return {
              allowed: false,
              requiresConfirmation: false,
              reason: `Actor lacks required permission 'tool:${toolName}:execute'.`
            };
          }
        }
      }
    } catch (err) {
      logger.warn('[CuratorRequestProcessor] Permission check encountered error, defaulting to safe allow:', err);
    }

    return { allowed: true, requiresConfirmation: false };
  }

  private async handleTool(ast: CuratorToolNode, req: any) {
    logger.info(`[CuratorRequestProcessor] Executing Tool '${ast.toolName}' for request ${req.id}`);
    const tool = curatorEngine.tools.get(ast.toolName);
    if (!tool) throw new Error(`Tool ${ast.toolName} not found in dynamic registry.`);

    const toolArgs = ast.args || { url: req.context?.input || '' };
    
    // Evaluate string expressions in toolArgs — supports both {{expr}} templates and (fn)(context) patterns
    const evaluatedArgs: Record<string, any> = {};
    for (const [k, v] of Object.entries(toolArgs)) {
      if (typeof v === 'string' && (v.startsWith('{{') || (v.startsWith('(') && v.endsWith('(context)')))) {
        evaluatedArgs[k] = await this.evaluateExpressionAsync(v, req);
      } else if (typeof v === 'object' && v !== null) {
        // Recursively resolve template strings inside nested arg objects
        const resolved: Record<string, any> = {};
        for (const [ik, iv] of Object.entries(v as Record<string, any>)) {
          if (typeof iv === 'string' && iv.startsWith('{{')) {
            resolved[ik] = await this.evaluateExpressionAsync(iv, req);
          } else {
            resolved[ik] = iv;
          }
        }
        evaluatedArgs[k] = resolved;
      } else {
        evaluatedArgs[k] = v;
      }
    }

    // RBAC & Tool confirmation gate
    const accessCheck = await this.checkToolAccess(req, ast.toolName, tool);
    if (!accessCheck.allowed) {
      if (accessCheck.requiresConfirmation) {
        logger.info(`[CuratorRequestProcessor] Request ${req.id} pausing on WAITING_FOR_USER for tool '${ast.toolName}'.`);
        await this.prisma.request.update({
          where: { id: req.id },
          data: {
            status: 'WAITING_FOR_USER',
            lockedBy: null,
            lockedAt: null,
            context: {
              ...req.context,
              pendingToolCall: { name: ast.toolName, args: evaluatedArgs },
              reason: accessCheck.reason
            }
          }
        });
        await this.saveResponse(req, `[WAITING_FOR_USER] ${accessCheck.reason}`);
        return;
      } else {
        await this.saveResponse(req, `[Access Denied] ${accessCheck.reason}`);
        await this.completeRequest(req.id, 'FAILED');
        return;
      }
    }

    let result = '';
    let rawOutput: any = undefined;
    try {
      rawOutput = await tool.runAsync({
        args: evaluatedArgs,
        toolContext: {
          conversationId: req.conversationId,
          userId: req.userId,
          projectId: req.projectId,
          prisma: this.prisma
        }
      });
      result = typeof rawOutput === 'string' ? rawOutput : JSON.stringify(rawOutput);
    } catch(e: any) {
      result = `[Tool Error] ${e.message}`;
    }

    // Store tool output in req.context under a short name derived from the tool name.
    // This is best-effort: if the DB update fails (e.g. P2028), we still proceed with
    // saveResponse + completeRequest using the in-memory context.
    if (rawOutput !== undefined) {
      const toolKey = this.toolNameToContextKey(ast.toolName);
      const updatedContext = { ...(req.context || {}), [toolKey]: rawOutput };
      updatedContext[ast.toolName] = rawOutput;
      req.context = updatedContext;
      try {
        await this.prisma.request.update({
          where: { id: req.id },
          data: { context: updatedContext }
        });
      } catch (ctxErr: any) {
        // Non-fatal: context update failed. In-memory context is still correct for
        // completeRequest → notifyId propagation within this same processing cycle.
        logger.warn(`[CuratorRequestProcessor] Context update skipped for req ${req.id}: ${ctxErr.message}`);
      }
    }

    await this.saveResponse(req, result);
    await this.completeRequest(req.id, 'COMPLETED');
  }

  /**
   * Derives a short context key from a tool name so that downstream nodes can reference
   * tool output with concise expressions like {{discovery.data}} or {{episode}}.
   *
   * Examples:
   *   vikerraadio_discover_episodes → discovery
   *   vikerraadio_process_episode   → episode
   *   vikerraadio_scrape            → scrape
   */
  private toolNameToContextKey(toolName: string): string {
    // Strip common vendor/platform prefixes
    const withoutPrefix = toolName.replace(/^(?:vikerraadio|klassikaraadio|err|keeris)_/, '');
    // Map well-known suffixes to friendly context keys
    const knownMappings: Record<string, string> = {
      discover_episodes: 'discovery',
      process_episode: 'episode',
      fetch_episode_page: 'page',
      parse_music_list: 'tracks',
      parse_episode_text: 'metadata',
      download_episode: 'download',
      scrape: 'scrape',
    };
    if (knownMappings[withoutPrefix]) return knownMappings[withoutPrefix];
    // Fallback: use the first underscore-segment
    return withoutPrefix.split('_')[0] || toolName;
  }

  private async handleSetState(ast: any, req: any) {
    logger.info(`[CuratorRequestProcessor] Setting state for request ${req.id}`);
    if (ast.state && typeof ast.state === 'object') {
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: req.conversationId }
      });
      const currentState = this.getConversationState(conversation);
      const newState = { ...currentState, ...ast.state };
      await this.updateConversationState(req.conversationId, newState);
      await this.saveResponse(req, JSON.stringify({ status: 'State updated', state: ast.state }));
    } else {
      await this.saveResponse(req, JSON.stringify({ status: 'No state provided' }));
    }
    await this.completeRequest(req.id, 'COMPLETED');
  }

  /**
   * Curator_Interrupt handler — Play / Pause / Stop for a conversation.
   *
   * mode: 'stop'  (default) — cancels all NEW requests below cancelBelowPriority, then runs handler.
   * mode: 'pause'           — suspends (PAUSED status) all NEW requests below priority, runs handler, then resumes them.
   * mode: 'play'            — resumes all PAUSED requests in this conversation.
   */
  private async handleInterrupt(ast: any, req: any) {
    const priority: number = ast.priority ?? 100;
    const cancelThreshold: number = ast.cancelBelowPriority ?? priority;
    const mode: 'stop' | 'pause' | 'play' = ast.mode ?? 'stop';

    logger.info(`[CuratorRequestProcessor] Interrupt (mode=${mode}, priority=${priority}) for conversation ${req.conversationId}`);

    if (mode === 'play') {
      // Resume all PAUSED requests in this conversation
      const resumed = await this.prisma.request.updateMany({
        where: {
          conversationId: req.conversationId,
          status: 'PAUSED'
        },
        data: { status: 'NEW', lockedBy: null, lockedAt: null }
      });
      logger.info(`[CuratorRequestProcessor] Resumed ${resumed.count} paused requests.`);
      await this.saveResponse(req, JSON.stringify({ status: 'play', resumed: resumed.count }));
      await this.completeRequest(req.id, 'COMPLETED');
      return;
    }

    if (mode === 'pause') {
      // Suspend all NEW requests below threshold
      const paused = await this.prisma.request.updateMany({
        where: {
          conversationId: req.conversationId,
          status: 'NEW',
          priority: { lt: cancelThreshold }
        },
        data: { status: 'PAUSED' }
      });
      logger.info(`[CuratorRequestProcessor] Paused ${paused.count} requests.`);

      // Run handler if provided
      if (ast.handler) {
        await this.createValidatedRequest({
          data: {
            userId: req.userId,
            conversationId: req.conversationId,
            status: 'NEW',
            priority,
            pendingDependencies: 0,
            notifyId: req.id,
            ast: ast.handler
          }
        });
        await this.saveResponse(req, JSON.stringify({ status: 'pause', paused: paused.count }));
        await this.completeRequest(req.id, 'WAITING');
      } else {
        await this.saveResponse(req, JSON.stringify({ status: 'pause', paused: paused.count }));
        await this.completeRequest(req.id, 'COMPLETED');
      }
      return;
    }

    // mode === 'stop': cancel all pending requests below threshold
    const cancelled = await this.prisma.request.updateMany({
      where: {
        conversationId: req.conversationId,
        status: 'NEW',
        priority: { lt: cancelThreshold }
      },
      data: { status: 'FAILED' }
    });
    logger.info(`[CuratorRequestProcessor] Cancelled ${cancelled.count} lower-priority requests.`);

    // Run the interrupt handler at high priority
    if (ast.handler) {
      // If resume is provided, handler notifies the resume node
      let notifyId = req.notifyId;
      if (ast.resume) {
        const resumeReq = await this.createValidatedRequest({
          data: {
            userId: req.userId,
            conversationId: req.conversationId,
            status: 'NEW',
            priority: 0,
            pendingDependencies: 1,
            notifyId: req.notifyId,
            ast: ast.resume
          }
        });
        notifyId = resumeReq.id;
      }

      await this.createValidatedRequest({
        data: {
          userId: req.userId,
          conversationId: req.conversationId,
          status: 'NEW',
          priority,
          pendingDependencies: 0,
          notifyId,
          ast: ast.handler
        }
      });
    }

    await this.saveResponse(req, JSON.stringify({ status: 'stop', cancelled: cancelled.count }));
    await this.completeRequest(req.id, 'COMPLETED');
  }

  private async interpolateTemplate(template: string | undefined, req: any): Promise<string | undefined> {
    if (!template) return template;
    
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: req.conversationId }
    });
    
    const state = this.getConversationState(conversation);
    
    const regex = /{([^}]+)}/g;
    let result = template;
    let match;
    
    while ((match = regex.exec(template)) !== null) {
      const fullMatch = match[0];
      const expression = match[1].trim();
      const isOptional = expression.endsWith('?');
      const varName = isOptional ? expression.slice(0, -1).trim() : expression;
      
      let replacementValue: string | undefined;

      if (varName.startsWith('artifact.')) {
        const artifactName = varName.substring(9).trim(); // "artifact.".length == 9
        const resource = await this.prisma.resource.findFirst({
          where: {
            OR: [
              { title: artifactName },
              { uri: artifactName }
            ]
          }
        });
        
        if (resource && resource.content) {
          replacementValue = resource.content;
        } else if (!isOptional) {
          throw new Error(`Template Error: Artifact '${artifactName}' not found or has no content`);
        }
      } else if (varName.startsWith('context.')) {
        const contextKey = varName.substring(8).trim();
        const ctx = req.context || {};
        if (contextKey in ctx && ctx[contextKey] !== undefined && ctx[contextKey] !== null) {
          replacementValue = typeof ctx[contextKey] === 'string' ? ctx[contextKey] : JSON.stringify(ctx[contextKey]);
        } else if (!isOptional) {
          throw new Error(`Template Error: Context variable '${contextKey}' is not defined`);
        }
      } else {
        // State variable
        if (varName in state && state[varName] !== undefined && state[varName] !== null) {
          replacementValue = String(state[varName]);
        } else if (!isOptional) {
          throw new Error(`Template Error: State variable '${varName}' is not defined`);
        }
      }

      if (replacementValue !== undefined) {
        result = result.replace(fullMatch, replacementValue);
      } else if (isOptional) {
        result = result.replace(fullMatch, ''); // Replace with empty string if optional and missing
      }
    }
    
    return result;
  }

  private async loadConversationHistory(req: any, includeContents?: string): Promise<LlmMessage[]> {
    if (includeContents === 'none') return [];
    
    const pastResponses = await this.prisma.response.findMany({
      where: { conversationId: req.conversationId, requestId: { lt: req.id } },
      orderBy: { createdAt: 'asc' },
      include: { request: true }
    });
    
    if (pastResponses.length === 0) return [];

    const messages: LlmMessage[] = [];

    for (const pr of pastResponses) {
      const prAst = pr.request?.ast as any;
      if (prAst?.exclude_from_history) continue;

      if (prAst?.type === 'Curator_Agent') {
        const prompt = await this.interpolateTemplate(prAst.prompt, pr.request) || '';
        if (prompt) messages.push({ role: 'user', content: prompt });
        messages.push({ role: 'assistant', content: pr.content });
      } else if (prAst?.type === 'Curator_HumanInput') {
        messages.push({ role: 'user', content: pr.content });
      } else if (prAst?.type === 'Curator_Script' || prAst?.type === 'Curator_Tool') {
        messages.push({ role: 'tool', toolName: prAst.toolName || prAst.name || 'tool', content: pr.content });
      }
    }

    return messages;
  }

  private async executeAgent(ast: CuratorAgentNode, req: any) {
    if (ast.input_schema) {
      const ajv = new Ajv();
      const validate = ajv.compile(ast.input_schema);
      
      let inputToValidate = req.context?.input;
      if (typeof inputToValidate === 'string') {
        try {
          inputToValidate = JSON.parse(inputToValidate);
        } catch (e) {
          // Fall through
        }
      }
      
      if (!validate(inputToValidate)) {
        await this.saveResponse(req, `[Agent Error] input_schema validation failed: ${ajv.errorsText(validate.errors)}`);
        await this.completeRequest(req.id, 'COMPLETED');
        return;
      }
    }

    let prompt = await this.interpolateTemplate(ast.prompt, req) || 'Hello';
    let instruction = await this.interpolateTemplate(ast.instruction, req);
    const hasTools = ast.tools && ast.tools.length > 0;

    if (ast.output_schema) {
      const schemaStr = JSON.stringify(ast.output_schema, null, 2);
      const schemaPrompt = `\n\nYou must respond with a JSON object conforming strictly to the following schema:\n${schemaStr}`;
      if (instruction) instruction += schemaPrompt;
      else instruction = schemaPrompt;
    }

    const provider = LlmFactory.getProvider(ast.provider, ast.baseUrl);
    const model = ast.model;

    logger.info(`[CuratorRequestProcessor] Executing Agent '${ast.agentName}' for request ${req.id} using provider '${provider.providerName}' [mode: ${hasTools ? 'agentic' : 'direct'}]`);

    // Build tool definitions if tools specified
    const toolDefs: LlmToolDefinition[] = [];
    if (hasTools) {
      for (const toolOrName of ast.tools!) {
        const tool = typeof toolOrName === 'string' ? curatorEngine.tools.get(toolOrName) : null;
        if (tool) {
          toolDefs.push({
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters as Record<string, unknown>
          });
        } else if (typeof toolOrName !== 'string') {
          toolDefs.push({
            name: toolOrName.name,
            description: toolOrName.description,
            parameters: toolOrName.parameters
          });
        }
      }
    }

    // Load Granular Message History from database
    const history = await this.loadConversationHistory(req, ast.include_contents);
    const messages: LlmMessage[] = [...history];
    messages.push({ role: 'user', content: prompt });

    // Multi-Turn LLM Agentic Loop (State-Machine Transitions)
    let iterations = 0;
    const MAX_ITERATIONS = 10;
    let finalOutput = '';

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const llmReq: LlmRequest = {
        model,
        systemPrompt: instruction,
        messages,
        tools: toolDefs.length > 0 ? toolDefs : undefined,
        jsonOutput: !!ast.output_schema,
        baseUrl: ast.baseUrl
      };

      const response = await provider.generateContent(llmReq);

      // If model returned no tool calls, it's a final answer
      if (!response.toolCalls || response.toolCalls.length === 0) {
        finalOutput = response.text || '';
        break;
      }

      // Model returned tool calls: persist the assistant turn into DB
      logger.info(`[CuratorRequestProcessor] Agent '${ast.agentName}' invoked ${response.toolCalls.length} tool(s) in turn ${iterations}.`);
      
      messages.push({
        role: 'assistant',
        content: response.text,
        toolCalls: response.toolCalls
      });

      // Save assistant response to DB for auditability
      await this.saveResponse(req, response.text || `[Invoking ${response.toolCalls.map(t => t.name).join(', ')}]`);

      // Execute each tool and check permissions
      let pausedForUser = false;

      for (const tc of response.toolCalls) {
        const tool = curatorEngine.tools.get(tc.name);
        let toolOutput = '';
        let isError = false;

        if (tool) {
          // Check tool access & permission
          const accessCheck = await this.checkToolAccess(req, tc.name, tool);
          if (!accessCheck.allowed) {
            if (accessCheck.requiresConfirmation) {
              logger.info(`[CuratorRequestProcessor] Request ${req.id} pausing on WAITING_FOR_USER for tool '${tc.name}'.`);
              await this.prisma.request.update({
                where: { id: req.id },
                data: {
                  status: 'WAITING_FOR_USER',
                  lockedBy: null,
                  lockedAt: null,
                  context: {
                    ...req.context,
                    pendingToolCall: tc,
                    reason: accessCheck.reason
                  }
                }
              });
              await this.saveResponse(req, `[WAITING_FOR_USER] Approval required to execute '${tc.name}' with args: ${JSON.stringify(tc.args)}`);
              pausedForUser = true;
              break;
            } else {
              toolOutput = `[Access Denied] ${accessCheck.reason}`;
              isError = true;
            }
          } else {
            try {
              const res = await tool.runAsync({
                args: tc.args,
                toolContext: {
                  conversationId: req.conversationId,
                  userId: req.userId,
                  projectId: req.projectId,
                  prisma: this.prisma
                }
              });
              toolOutput = typeof res === 'string' ? res : JSON.stringify(res);
            } catch (err: any) {
              toolOutput = `[Tool Error] ${err.message}`;
              isError = true;
            }
          }
        } else {
          // Inline tool check
          const inlineDef = (ast.tools as any[]).find((t: any) => typeof t !== 'string' && t.name === tc.name);
          if (inlineDef) {
            try {
              const sandbox = { console, args: tc.args, fetch };
              const ctx = vm.createContext(sandbox);
              const wrapper = `(async () => { const fn = ${inlineDef.sourceCode}; return await fn(args); })()`;
              const res = await vm.runInContext(wrapper, ctx);
              toolOutput = typeof res === 'string' ? res : JSON.stringify(res);
            } catch (err: any) {
              toolOutput = `[Inline Tool Error] ${err.message}`;
              isError = true;
            }
          } else {
            toolOutput = `[Error] Tool '${tc.name}' not found.`;
            isError = true;
          }
        }

        // Push tool output message to context
        messages.push({
          role: 'tool',
          toolCallId: tc.id,
          toolName: tc.name,
          content: toolOutput,
          isError
        });

        // Save tool result response to DB
        await this.saveResponse(req, `[Tool Result: ${tc.name}]\n${toolOutput}`);
      }

      if (pausedForUser) {
        return; // Request safely paused in DB
      }
    }

    logger.info(`[CuratorRequestProcessor] Agent '${ast.agentName}' completed in ${iterations} turn(s). Output length: ${finalOutput.length}`);
    await this.saveResponse(req, finalOutput);
    await this.completeRequest(req.id, 'COMPLETED');
  }

  private async saveResponse(req: any, content: string) {
    try {
      await this.prisma.response.create({
        data: {
          requestId: req.id,
          conversationId: req.conversationId,
          projectId: req.projectId ?? null,
          content,
        }
      });
    } catch (err: any) {
      // P2028: transaction already closed (common when an error rolled back the TX).
      // Log at warn level and continue — the error is already recorded elsewhere.
      if (err?.code === 'P2028' || err?.message?.includes('Transaction already closed')) {
        logger.warn(`[CuratorRequestProcessor] saveResponse skipped for req ${req.id}: ${err.message}`);
      } else {
        throw err;
      }
    }
  }

  private async completeRequest(requestId: number, status: string = 'COMPLETED', skipNotify: boolean = false) {
    let req: any;
    try {
      req = await this.prisma.request.update({
        where: { id: requestId },
        data: { status, lockedBy: null, lockedAt: null }
      });
    } catch (err: any) {
      if (err?.code === 'P2028' || err?.message?.includes('Transaction already closed')) {
        logger.warn(`[CuratorRequestProcessor] completeRequest: status update skipped for req ${requestId} (closed tx): ${err.message}`);
        return;
      }
      throw err;
    }
    this.emit('request_done', { requestId, success: status === 'COMPLETED', status });

    if (req.notifyId && !skipNotify) {
      try {
        const responses = await this.prisma.response.findMany({ where: { requestId }, orderBy: { createdAt: 'desc' }, take: 1 });
        const lastContent = responses[0]?.content;

        const targetReq = await this.prisma.request.findUnique({ where: { id: req.notifyId } });
        if (targetReq) {
          const newPendingDeps = Math.max(0, (targetReq.pendingDependencies || 0) - 1);
          let updatedData: any = {
            pendingDependencies: newPendingDeps
          };
          if (newPendingDeps === 0 && targetReq.status === 'WAITING') {
            updatedData.status = 'NEW';
            updatedData.lockedBy = null;
            updatedData.lockedAt = null;
          }

          // --- CONVERSATION STATE MERGING ---
          const conv = await this.prisma.conversation.findUnique({
            where: { id: targetReq.conversationId }
          });

          let currentConvState = this.getConversationState(conv);
          let newUpdates: any = {};

          if (lastContent) {
            try {
              const parsed = JSON.parse(lastContent);
              if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
                newUpdates = parsed;
              } else {
                newUpdates = { output: lastContent };
              }
            } catch (e) {
              newUpdates = { output: lastContent };
            }
          }

          const mergedState = { ...currentConvState, ...newUpdates };
          await this.updateConversationState(targetReq.conversationId, mergedState);

          // Carry forward named tool output keys from source request context
          // (e.g. `discovery`, `episode`) so downstream nodes can reference them.
          let targetContext = (targetReq.context as any) || {};
          if (typeof targetContext === 'string') {
            try { targetContext = JSON.parse(targetContext); } catch (_) {}
          }
          let sourceContext = (req.context ?? {}) as any;
          if (typeof sourceContext === 'string') {
            try { sourceContext = JSON.parse(sourceContext); } catch (_) {}
          }
          const skipKeys = new Set(['forEachIndex', 'forEachCollection', 'ifElseEvaluated',
            'spawnedChild', 'routeDecided', 'pendingToolCall', 'waitEvent', 'payloadAlias']);
          for (const [k, v] of Object.entries(sourceContext)) {
            if (!skipKeys.has(k)) targetContext[k] = v;
          }
          targetContext.input = JSON.stringify(mergedState);
          targetContext.state = mergedState;
          updatedData.context = targetContext;

          await this.prisma.request.update({
            where: { id: req.notifyId },
            data: updatedData
          });
        }
      } catch (notifyErr: any) {
        if (notifyErr?.code === 'P2028' || notifyErr?.message?.includes('Transaction already closed')) {
          logger.warn(`[CuratorRequestProcessor] completeRequest: notify skipped for req ${requestId} (closed tx)`);
        } else {
          logger.error(`[CuratorRequestProcessor] completeRequest: notify error for req ${requestId}:`, notifyErr);
        }
      }
    }
  }

  private async evaluateExpressionAsync(expr: string, req: any): Promise<any> {
    const conv = await this.prisma.conversation.findUnique({ where: { id: req.conversationId } });
    let reqContext = req.context || {};
    if (typeof reqContext === 'string') {
      try { reqContext = JSON.parse(reqContext); } catch (_) {}
    }
    req.context = reqContext;
    const convState = (typeof req.context.state === 'object' && req.context.state !== null)
      ? req.context.state
      : this.getConversationState(conv);
    req.context.state = convState;

    // Strip {{...}} mustache wrappers — the VM just needs the raw JS expression
    let cleanExpr = (expr || '').trim();
    if (cleanExpr.startsWith('{{') && cleanExpr.endsWith('}}')) {
      cleanExpr = cleanExpr.slice(2, -2).trim();
    }

    // Build sandbox: start with state keys at top level, then add well-known aliases,
    // then spread the full req.context so any named tool output (e.g. `discovery`) is accessible.
    const safeSandbox: Record<string, any> = {};
    // First copy state keys
    for (const [k, v] of Object.entries(convState)) {
      try { JSON.stringify(v); safeSandbox[k] = v; } catch (_) {}
    }
    // Then overlay context keys (tool outputs, iterator vars)
    for (const [k, v] of Object.entries(req.context)) {
      if (k === 'state') continue;
      try { JSON.stringify(v); safeSandbox[k] = v; } catch (_) {}
    }
    // Always ensure these are present
    safeSandbox.state = convState;
    safeSandbox.input = req.context.input;
    safeSandbox.context = req.context;

    const vmContext = vm.createContext(safeSandbox);
    try {
      return vm.runInContext(cleanExpr, vmContext);
    } catch (e) {
      logger.error(`[CuratorRequestProcessor] Expression evaluation failed for: ${cleanExpr}`, e);
      return false;
    }
  }

  private async handleAssign(ast: any, req: any) {
    logger.info(`[CuratorRequestProcessor] Handling Assign node for ${req.id}`);
    const evaluatedValue = await this.evaluateExpressionAsync(ast.expression, req);
    
    const updateObj: Record<string, any> = {};
    updateObj[ast.key] = evaluatedValue;
    
    const conv = await this.prisma.conversation.findUnique({ where: { id: req.conversationId } });
    const currentConvState = this.getConversationState(conv);
    const newState = { ...currentConvState, ...updateObj };
    await this.updateConversationState(req.conversationId, newState);
    
    // Also update req.context.state for subsequent operations in this loop
    const newContext = { ...(req.context || {}), state: newState };
    await this.prisma.request.update({
      where: { id: req.id },
      data: { context: newContext }
    });
    
    await this.saveResponse(req, `Assigned ${ast.key} = ${JSON.stringify(evaluatedValue)}`);
    await this.completeRequest(req.id, 'COMPLETED');
  }

  private async handleIfElse(ast: any, req: any) {
    logger.info(`[CuratorRequestProcessor] Handling IfElse node for ${req.id}`);
    
    if (req.context?.ifElseEvaluated) {
      // The branch finished and woke us up.
      await this.saveResponse(req, `IfElse completed branch.`);
      await this.completeRequest(req.id, 'COMPLETED');
      return;
    }

    const conditionResult = await this.evaluateExpressionAsync(ast.condition, req);
    const branchToExecute = conditionResult ? ast.thenBranch : ast.elseBranch;
    
    if (branchToExecute) {
      await this.createValidatedRequest({
        data: {
          ast: branchToExecute,
          context: req.context,
          projectId: req.projectId,
          agentId: req.agentId,
          scriptId: req.scriptId,
          conversationId: req.conversationId,
          userId: req.userId || 1,
          status: 'NEW',
          pendingDependencies: 0,
          notifyId: req.id
        }
      });
      await this.prisma.request.update({
        where: { id: req.id },
        data: { 
          status: 'WAITING', 
          lockedBy: null, 
          lockedAt: null, 
          pendingDependencies: 1,
          context: { ...req.context, ifElseEvaluated: true }
        }
      });
    } else {
      await this.saveResponse(req, `IfElse condition evaluated to ${conditionResult}. No branch executed.`);
      await this.completeRequest(req.id, 'COMPLETED');
    }
  }

  private async handleWhile(ast: any, req: any) {
    logger.info(`[CuratorRequestProcessor] Handling While node for ${req.id}`);
    
    // We need fresh state to evaluate condition properly across iterations
    const conv = await this.prisma.conversation.findUnique({ where: { id: req.conversationId } });
    req.context = req.context || {};
    req.context.state = this.getConversationState(conv);

    const conditionResult = await this.evaluateExpressionAsync(ast.condition, req);
    
    if (conditionResult) {
      await this.createValidatedRequest({
        data: {
          ast: ast.body,
          context: req.context,
          projectId: req.projectId,
          agentId: req.agentId,
          scriptId: req.scriptId,
          conversationId: req.conversationId,
          userId: req.userId || 1,
          status: 'NEW',
          pendingDependencies: 0,
          notifyId: req.id
        }
      });
      await this.prisma.request.update({
        where: { id: req.id },
        data: { status: 'WAITING', lockedBy: null, lockedAt: null, pendingDependencies: 1 }
      });
    } else {
      await this.saveResponse(req, `While loop finished.`);
      await this.completeRequest(req.id, 'COMPLETED');
    }
  }

  private async handleForEach(ast: any, req: any) {
    logger.info(`[CuratorRequestProcessor] Handling ForEach node for ${req.id}`);
    
    let collection = req.context?.forEachCollection;
    if (!collection) {
      collection = await this.evaluateExpressionAsync(ast.collectionExpression, req);
    }

    if (!Array.isArray(collection) || collection.length === 0) {
      await this.saveResponse(req, `ForEach finished (empty).`);
      await this.completeRequest(req.id, 'COMPLETED');
      return;
    }

    let currentIndex = req.context?.forEachIndex || 0;
    
    if (currentIndex >= collection.length) {
      await this.saveResponse(req, `ForEach finished.`);
      await this.completeRequest(req.id, 'COMPLETED');
      return;
    }

    const item = collection[currentIndex];
    const iteratorName = ast.iteratorName || 'item';
    
    await this.createValidatedRequest({
      data: {
        ast: ast.body,
        context: { ...req.context, [iteratorName]: item },
        projectId: req.projectId,
        agentId: req.agentId,
        scriptId: req.scriptId,
        conversationId: req.conversationId,
        userId: req.userId || 1,
        status: 'NEW',
        pendingDependencies: 0,
        parentId: req.id,
        notifyId: req.id
      }
    });

    await this.prisma.request.update({
      where: { id: req.id },
      data: { 
        status: 'WAITING', 
        lockedBy: null, 
        lockedAt: null, 
        pendingDependencies: 1,
        context: { ...req.context, forEachIndex: currentIndex + 1, forEachCollection: collection }
      }
    });
  }
}

/**
 * Standard 5-field cron matcher (minute hour dom month dow).
 * Supports numbers, comma lists, ranges (1-5), steps (* / 15, 1-5/2).
 */
export function isCronDue(cronExpression: string, date: Date = new Date()): boolean {
  if (!cronExpression || typeof cronExpression !== 'string') return false;
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const [minExpr, hourExpr, domExpr, monExpr, dowExpr] = parts;
  const minute = date.getMinutes();
  const hour = date.getHours();
  const dayOfMonth = date.getDate();
  const month = date.getMonth() + 1; // 1-12
  const dayOfWeek = date.getDay();   // 0-6 (0 = Sunday)

  const matchField = (expr: string, value: number, isDow = false): boolean => {
    if (expr === '*') return true;
    for (const segment of expr.split(',')) {
      if (segment.includes('/')) {
        const [range, stepStr] = segment.split('/');
        const step = parseInt(stepStr, 10);
        if (isNaN(step) || step <= 0) return false;
        let start = 0;
        let end = 59;
        if (range !== '*') {
          const rangeParts = range.split('-');
          start = parseInt(rangeParts[0], 10);
          end = rangeParts[1] ? parseInt(rangeParts[1], 10) : start;
        }
        if (value >= start && value <= end && (value - start) % step === 0) return true;
      } else if (segment.includes('-')) {
        const [startStr, endStr] = segment.split('-');
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (value >= start && value <= end) return true;
        if (isDow && (start === 7 || end === 7) && value === 0) return true;
      } else {
        const target = parseInt(segment, 10);
        if (value === target) return true;
        if (isDow && target === 7 && value === 0) return true;
      }
    }
    return false;
  };

  return (
    matchField(minExpr, minute) &&
    matchField(hourExpr, hour) &&
    matchField(domExpr, dayOfMonth) &&
    matchField(monExpr, month) &&
    matchField(dowExpr, dayOfWeek, true)
  );
}

/**
 * Unified schedule evaluator supporting both 5-field Cron expressions and Bree/Later human syntax
 * (e.g. "0 14 * * 1-5", "every 10 minutes", "every 1 hour", "at 14:00").
 */
export function isScheduleDue(schedule: string, date: Date = new Date()): boolean {
  if (!schedule || typeof schedule !== 'string') return false;
  const trimmed = schedule.trim();
  const parts = trimmed.split(/\s+/);

  // 1. Standard 5-field Cron syntax
  if (parts.length === 5 && !/^(every|at|on|after)\b/i.test(trimmed)) {
    return isCronDue(trimmed, date);
  }

  // 2. Bree / Human interval syntax ("every X minutes/hours/days")
  const everyMatch = trimmed.match(/^every\s+(\d+)?\s*(minute|hour|day|second)s?$/i);
  if (everyMatch) {
    const amount = parseInt(everyMatch[1] || '1', 10);
    const unit = everyMatch[2].toLowerCase();
    if (unit === 'minute') {
      return date.getMinutes() % amount === 0;
    } else if (unit === 'hour') {
      return date.getMinutes() === 0 && date.getHours() % amount === 0;
    } else if (unit === 'day') {
      return date.getMinutes() === 0 && date.getHours() === 0 && date.getDate() % amount === 0;
    }
  }

  // 3. Bree "at HH:MM" syntax (e.g. "at 14:00" or "at 2:00 pm")
  const atMatch = trimmed.match(/^at\s+(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/i);
  if (atMatch) {
    let targetHour = parseInt(atMatch[1], 10);
    const targetMin = parseInt(atMatch[2], 10);
    const ampm = atMatch[3]?.toLowerCase();
    if (ampm === 'pm' && targetHour < 12) targetHour += 12;
    if (ampm === 'am' && targetHour === 12) targetHour = 0;
    return date.getHours() === targetHour && date.getMinutes() === targetMin;
  }

  return false;
}

/**
 * Calculates the next upcoming Date matching the schedule (cron or interval) starting from fromDate.
 */
export function computeNextRunDate(schedule: string, fromDate: Date = new Date()): Date {
  if (!schedule || typeof schedule !== 'string') {
    return new Date(fromDate.getTime() + 60000);
  }
  const trimmed = schedule.trim();
  const start = new Date(Math.floor((fromDate.getTime() + 60000) / 60000) * 60000);
  start.setSeconds(0, 0);

  // Search up to 366 days in advance
  const maxMinutes = 60 * 24 * 366;
  const current = new Date(start.getTime());

  for (let i = 0; i < maxMinutes; i++) {
    if (isScheduleDue(trimmed, current)) {
      return current;
    }
    current.setTime(current.getTime() + 60000);
  }

  return new Date(fromDate.getTime() + 3600000);
}


