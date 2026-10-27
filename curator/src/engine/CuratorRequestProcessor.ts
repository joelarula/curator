import * as vm from 'node:vm';
import AjvModule from 'ajv';
const Ajv = (AjvModule as any).default || AjvModule;
import { curatorEngine } from './CuratorEngine.js';
import { curatorContext } from './CuratorContext.js';

import type { CuratorAstNode, CuratorAgentNode, CuratorSequentialNode, CuratorParallelNode, CuratorJoinNode, CuratorToolNode, CuratorScriptNode, CuratorRouteNode, CuratorGraphNode } from './CuratorAst.js';
import { logger } from '../utils/logger.js';
import { validateCuratorAst, parseCuratorRef, AST_LIMITS } from './CuratorAstValidation.js';
import { superviseAgentLoops, isValidSchedule } from './AgentScheduleSupervisor.js';
export { isValidSchedule };
import { AsyncLocalStorage } from 'node:async_hooks';
import type { CuratorCallNode, CuratorSubscribeNode, CuratorUnsubscribeNode, CuratorParamSpec, CuratorLoopNode, CuratorInlineTool } from './CuratorAst.js';
import type { CuratorEventEmitResult, CuratorStructuredResponse } from './CuratorContracts.js';
import { resolveRef, resolveRequestNode, getScriptVersionAst, getEntry, entryAstPath, expandInlineCalls, saveAdhocScript } from './ScriptRegistry.js';
import { coffeeAstVerbs } from './CoffeeVerbs.js';
import type { Prisma } from '@prisma/client';
import { LlmFactory } from './llm/LlmFactory.js';
import type { LlmMessage, LlmToolDefinition, LlmRequest } from './llm/ILlmProvider.js';
import { buildContext } from './llm/ConversationFold.js';
import { AgentRoleService } from '../services/AgentRoleService.js';
import { ApprovalService } from '../services/ApprovalService.js';
// Audit trail = Request/Response rows (see AuditService for the derived read view).
import { SecretService } from '../services/SecretService.js';

export interface CuratorRequestProcessorOptions {
  onEvent?: (type: string, payload: any) => void;
  maxConcurrency?: number;
  reserveWebConnections?: number;
  poolLimit?: number;
  /** 'reference' (default): child Requests point to scriptId+scriptVersion+context.astPath; 'snapshot': they carry the AST. */
  astStorage?: 'reference' | 'snapshot';
  /** Maximum nested Curator_Call depth (child mode). Default 16. */
  maxCallDepth?: number;
  /** Tool registry used for Curator_Tool nodes and direct tool Requests. Default: the global curatorEngine. */
  engine?: { tools: Map<string, any> };
  /** Non-serializable values merged into every tool's toolContext (e.g. `{ host }`). */
  toolContextExtras?: Record<string, any>;
  /** Default lifetime of an approval wait in ms (0 = never expires). Default 24h. Tool nodes may override (`approvalTtlMs`). */
  approvalTtlMs?: number;
  /** Retention of completed read-only direct tool Requests. Workflow Requests are never pruned. */
  retention?: { readOnlyRequests?: 'keep' | 'prune'; readOnlyTtlMs?: number };
  /** Clock (epoch ms) for scheduling, wait deadlines and approval expiry. Default Date.now; injectable for deterministic tests. */
  now?: () => number;
}

export type CuratorRequestOriginKind = 'AST' | 'REPL' | 'CLI' | 'API' | 'MCP' | 'GRAPHQL';

/** A single direct tool call (REPL / CLI / API) executed as a light Request. */
export interface RunToolRequestInput {
  toolName: string;
  /** Literal arguments, persisted on the Request (no `$`/`{{ }}` evaluation). */
  args?: Record<string, any>;
  /** Runtime-only arguments merged at execution and never persisted (e.g. derived game state). */
  runtimeArgs?: Record<string, any>;
  /** Runtime-only toolContext values (e.g. `{ host }`). */
  runtimeContext?: Record<string, any>;
  conversationId: number;
  userId: string;
  projectId?: string | null;
  agentId?: string | null;
  origin: CuratorRequestOriginKind;
  /** Extra persisted context (e.g. sessionId). */
  context?: Record<string, any>;
  /** Broadcast `result.event` via onEvent. Default true; set false when the caller broadcasts it. */
  broadcastToolEvents?: boolean;
}

export interface RunToolRequestResult {
  requestId: number;
  status: string;
  /** Raw tool output (in-process), falling back to the parsed Response content. */
  result: any;
  /** Structured record when the Response is TOOL_BLOCKED / APPROVAL_REQUIRED. */
  record?: CuratorStructuredResponse;
}

/** Options for the shared event matcher. */
export interface DispatchEventOptions {
  /** Additional wait matching beyond `waitEvent === eventName` (e.g. domain event families). */
  matchWait?: (waitEvent: string | undefined, eventName: string, payload: any) => boolean;
  /** Restrict delivery to one waiting Request in the current conversation. */
  targetRequestId?: number;
  /** Value bound to the resumed Request's alias. Default: the payload. */
  waitValue?: (payload: any) => any;
  /** Keys merged into resumed Requests' context (and context.state when present), e.g. sessionId. */
  contextPatch?: Record<string, any>;
}

/** A single emitted event (REPL / CLI / API) recorded as a Request with an EVENT_EMITTED Response. */
export interface EmitEventRequestInput extends DispatchEventOptions {
  eventName: string;
  payload?: any;
  conversationId: number;
  userId: string;
  projectId?: string | null;
  agentId?: string | null;
  targetAgentId?: string;
  origin: CuratorRequestOriginKind;
  /** Also broadcast via onEvent (ephemeral). Default true. */
  broadcast?: boolean;
}

export interface StepUntilOptions {
  conversationId?: number;
  maxSteps?: number;
  until?: (req: any) => boolean;
}

export interface StepUntilResult {
  steps: number;
  done: boolean;
  waiting: boolean;
  waitingRequest: any | null;
  waitEvent?: string;
}

export class CuratorRequestProcessor {
  private prisma: any;
  private timer: NodeJS.Timeout | null = null;
  public isAdHoc: boolean = false;
  private isPolling = false;
  private activeTasks = 0;
  private backoffUntil: number = 0;
  private workerId = `curator-worker-${Math.random().toString(36).substring(7)}`;
  private onEvent?: (type: string, payload: any) => void;
  private poolLimit: number;
  private reserveWebConnections: number;
  private maxConcurrency: number;
  private astStorage: 'reference' | 'snapshot';
  private maxCallDepth: number;
  /** Script version of the Request being executed; pins child Requests to the same version. */
  private execScope = new AsyncLocalStorage<{ scriptId?: number | null; scriptVersion?: number | null }>();
  private engine: { tools: Map<string, any> };
  private toolContextExtras: Record<string, any>;
  /** In-process data of direct tool Requests: runtime-only inputs and the raw output/error. */
  private inflight = new Map<number, { runtimeArgs?: Record<string, any>; runtimeContext?: Record<string, any>; broadcastToolEvents?: boolean; raw?: any; error?: any }>();
  private approvalTtlMs: number;
  private retention: { readOnlyRequests: 'keep' | 'prune'; readOnlyTtlMs: number };
  private lastPruneAt = 0;
  private clock: () => number;

  constructor(prisma: any, options: CuratorRequestProcessorOptions = {}) {
    this.prisma = prisma;
    this.clock = options.now ?? Date.now;
    this.onEvent = options.onEvent;
    this.astStorage = options.astStorage ?? 'reference';
    this.maxCallDepth = options.maxCallDepth ?? 16;
    this.engine = options.engine ?? curatorEngine;
    this.toolContextExtras = options.toolContextExtras ?? {};
    this.approvalTtlMs = options.approvalTtlMs ?? 24 * 60 * 60 * 1000;
    this.retention = {
      readOnlyRequests: options.retention?.readOnlyRequests ?? 'keep',
      readOnlyTtlMs: options.retention?.readOnlyTtlMs ?? 30 * 24 * 60 * 60 * 1000
    };

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
    logger.debug(`[CuratorRequestProcessor] Concurrency limit initialized to ${this.maxConcurrency} (DB Pool: ${this.poolLimit}, Reserved for Web: ${this.reserveWebConnections})`);
  }

  private emit(type: string, payload: any) {
    try {
      this.onEvent?.(type, payload);
    } catch (_) {}
  }

  private async createValidatedRequest(args: any) {
    const scope = this.execScope.getStore();
    if (scope?.scriptVersion && args.data.scriptId != null && args.data.scriptId === scope.scriptId && args.data.scriptVersion === undefined) {
      args = { ...args, data: { ...args.data, scriptVersion: scope.scriptVersion } };
    }
    if (args.data.ast == null && args.data.scriptId != null) {
      // Reference mode: the node lives in ScriptVersion (validated on save), addressed by context.astPath.
      const { ast: _omit, ...refData } = args.data;
      if (refData.scheduledAt === null || refData.scheduledAt === undefined) delete refData.scheduledAt;
      return this.prisma.request.create({ ...args, data: refData });
    }
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

  /**
   * Private scopes: a flow carrying `context.__scope` reads shared state plus its own bucket
   * (`state.__scopes[scope]`) and writes only to that bucket. Other buckets are never exposed.
   */
  private stateView(raw: Record<string, any>, scope?: string | null): Record<string, any> {
    const { __scopes, ...shared } = raw || {};
    return scope != null ? { ...shared, ...((__scopes || {})[scope] || {}) } : shared;
  }

  private async writeState(conversationId: any, scope: string | null | undefined, updates: Record<string, any>) {
    const conv = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    const raw: Record<string, any> = { ...this.getConversationState(conv) };
    if (scope != null) {
      const scopes = { ...(raw.__scopes || {}) };
      scopes[scope] = { ...(scopes[scope] || {}), ...updates };
      raw.__scopes = scopes;
    } else {
      Object.assign(raw, updates);
    }
    return this.updateConversationState(conversationId, raw);
  }

  private parseContext(ctx: any): any {
    if (typeof ctx === 'string') { try { return JSON.parse(ctx); } catch { return {}; } }
    return ctx || {};
  }

  /** Identity used to address events: the private scope, else the request's agent. */
  private identityOf(req: any): string | null {
    const scope = this.parseContext(req.context).__scope;
    if (scope != null) return String(scope);
    return req.agentId != null ? String(req.agentId) : null;
  }

  public isStopped: boolean = false;

  public async start(intervalMs: number = 3000) {
    this.isStopped = false;
    await this.syncToolsToDb();
    await this.syncAgentsToDb();
    logger.debug(`[CuratorRequestProcessor] Starting worker ${this.workerId} with ${intervalMs}ms interval...`);
    this.timer = setInterval(() => this.pollRequests(), intervalMs);
    if ((this.timer as any)?.unref) {
      (this.timer as any).unref();
    }
    this.pollRequests();
  }

  private async syncToolsToDb() {
    try {
      logger.debug(`[CuratorRequestProcessor] Syncing tools & permissions from CuratorEngine registry...`);
      let count = 0;

      // Seed baseline security roles
      await AgentRoleService.ensureDefaultRoles(this.prisma);

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
      logger.debug(`[CuratorRequestProcessor] Synced ${count} tools with permissions & nested roles.`);
    } catch (err) {
      logger.error('[CuratorRequestProcessor] Failed to sync tools to DB:', err);
    }
  }

  private async syncAgentsToDb() {
    try {
      logger.debug(`[CuratorRequestProcessor] Syncing agents from CuratorEngine registry...`);
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
      logger.debug(`[CuratorRequestProcessor] Synced ${count} agents.`);

      // Clean up any lingering active/pending requests for disabled agents
      try {
        const disabledAgents = await this.prisma.agent.findMany({
          where: { enabled: false },
          select: { id: true, name: true, scriptId: true }
        });
        const totalCount = await this.prisma.agent.count();
        const enabledCount = await this.prisma.agent.count({ where: { enabled: true } });

        if (totalCount > 0 && enabledCount === 0) {
          logger.debug(`[CuratorRequestProcessor] All agents are disabled. Cancelling all active/pending/waiting requests in DB...`);
          await this.prisma.request.updateMany({
            where: {
              status: { in: ['NEW', 'WAITING', 'WAITING_FOR_USER', 'WAITING_FOR_EVENT', 'PAUSED'] }
            },
            data: { status: 'CANCELLED', lockedBy: null, lockedAt: null }
          });
        } else if (disabledAgents.length > 0) {
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
    this.isStopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.debug(`[CuratorRequestProcessor] Worker ${this.workerId} stopped.`);
    }
  }

  private async pollScheduledAgents() {
    const now = new Date(this.clock());
    const currentMinuteBucket = Math.floor(now.getTime() / 60000);
    if (this.lastScheduleMinuteBucket === currentMinuteBucket) {
      return; // Already evaluated schedules in this minute
    }
    this.lastScheduleMinuteBucket = currentMinuteBucket;

    try {
      // Scheduling is a Curator_Loop; this supervisor only keeps one live loop per enabled, scheduled Agent.
      const result = await superviseAgentLoops(this.prisma, async (agent, loopAst) => {
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
            ast: loopAst
          }
        });
        logger.debug(`[CuratorRequestProcessor] Scheduler loop for agent '${agent.name}' started on '${agent.schedule}' (Request #${newReq.id})`);
        this.emit('log', { message: `[Curator] Scheduler loop for agent '${agent.name}' started on '${agent.schedule}' (Request #${newReq.id})` });
      });
      if (result.started.length || result.restarted.length || result.cancelled.length) {
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
    if (this.isStopped || !this.timer) return;
    if (this.isPolling) return;
    this.isPolling = true;
    try {
      if (Date.now() < this.backoffUntil) {
        return;
      }

      await this.unlockStaleRequests();

      // 0. Poll enabled scheduled agents if due
      await this.pollScheduledAgents();

      // 0b. Expire approval waits past their deadline; prune old read-only direct tool Requests (if enabled)
      await this.expireApprovalWaits();
      await this.expireHumanWaits();
      await this.pruneReadOnlyRequests();

      // 1. Wake up requests that were WAITING_FOR_USER and just received a response
      const userRespondedRequests = await this.prisma.request.findMany({
        where: {
          status: { in: ['WAITING', 'WAITING_FOR_USER'] },
          responses: { some: {} } // Has at least one response
        },
        include: { responses: { orderBy: { createdAt: 'desc' }, take: 1 } },
        take: 5
      });

      for (const req of userRespondedRequests) {
        // Approval waits are resumed only by an approval (approveRequest) or by expiry, never by a Response.
        if ((req.context as any)?.pendingToolCall) continue;

        // System records written on the parked Request itself (prompt, approval notice, ...) are not human input.
        const latest = (req as any).responses?.[0];
        let latestParsed: any = null;
        try { latestParsed = typeof latest?.content === 'string' ? JSON.parse(latest.content) : null; } catch (_) {}
        if (CuratorRequestProcessor.isStructuredRecord(latestParsed) && latestParsed.type !== 'CHOICE_RECEIVED') continue;

        // Check targetUserId — if set, only a response from that specific user counts
        const targetUserId = (req.context as any)?.targetUserId;
        if (targetUserId) {
          const latestResponse = (req as any).responses?.[0];
          if (!latestResponse || latestResponse.userId !== targetUserId) {
            continue; // Not yet answered by the right player
          }
        }

        logger.debug(`[CuratorRequestProcessor] Request ${req.id} received human input. Resuming...`);
        // We lock it briefly so another worker doesn't double-complete it
        await this.prisma.request.update({
          where: { id: req.id },
          data: { status: 'WAITING', lockedBy: this.workerId, lockedAt: new Date() }
        });

        const latestResponse = (req as any).responses?.[0];
        let inputContent = latestResponse?.content;
        let parsedContent: any = inputContent;
        try {
          parsedContent = JSON.parse(inputContent);
        } catch (_) {}

        const asKey = (req.context as any)?.choiceAs || (req.context as any)?.as;
        if (asKey) {
          req.context = req.context || {};
          req.context[asKey] = parsedContent;
        }

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
          scheduledAt: { lte: new Date(this.clock()) }
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

  /**
   * Synchronously polls and executes runnable requests in sequence.
   * Enables direct step execution (e.g. human turn to human turn) in embedded CLI and tests.
   * Can be filtered to a specific conversation (e.g. specific table) or step all pending tasks.
   */
  public async step(options?: { conversationId?: number; take?: number }): Promise<number> {
    await this.expireHumanWaits();
    const availableSlots = options?.take ?? this.getAvailableConcurrencySlots();
    if (availableSlots <= 0) return 0;

    const where: any = {
      status: 'NEW',
      pendingDependencies: { lte: 0 },
      scheduledAt: { lte: new Date(this.clock()) }
    };
    if (options?.conversationId !== undefined) {
      where.conversationId = options.conversationId;
    }

    const requests = await this.prisma.request.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: availableSlots
    });

    if (!requests || requests.length === 0) return 0;

    const lockedRequests: any[] = [];
    for (const req of requests) {
      const updated = await this.prisma.request.updateMany({
        where: { id: req.id, status: 'NEW' },
        data: { status: 'WAITING', lockedBy: this.workerId, lockedAt: new Date() }
      });
      if (updated.count > 0) lockedRequests.push(req);
    }

    for (const req of lockedRequests) {
      await this.processRequest(req);
    }

    return lockedRequests.length;
  }

  /**
   * Universally steps an AST workflow synchronously in-process
   * until an asynchronous wait gate is reached (WAITING_FOR_EVENT / WAITING_FOR_USER / PAUSED)
   * or execution completes.
   */
  public async stepUntil(options?: StepUntilOptions): Promise<StepUntilResult> {
    const maxSteps = options?.maxSteps ?? 500;
    let steps = 0;
    const convId = options?.conversationId;

    while (steps < maxSteps) {
      await this.expireHumanWaits();
      // 1. Check if currently parked at an asynchronous wait gate
      const waitingReq = await this.prisma.request.findFirst({
        where: {
          ...(convId !== undefined ? { conversationId: convId } : {}),
          status: { in: ['WAITING_FOR_EVENT', 'WAITING_FOR_USER', 'PAUSED'] },
        },
        orderBy: { updatedAt: 'desc' },
      });

      if (waitingReq) {
        const ctx = (waitingReq.context as any) || {};
        return {
          steps,
          done: false,
          waiting: true,
          waitingRequest: waitingReq,
          waitEvent: ctx.waitEvent,
        };
      }

      // 2. Execute one AST step cycle
      const processed = await this.step({ conversationId: convId });

      if (processed === 0) {
        // Re-check wait status in case the last processed task parked into a wait state
        const finalWait = await this.prisma.request.findFirst({
          where: {
            ...(convId !== undefined ? { conversationId: convId } : {}),
            status: { in: ['WAITING_FOR_EVENT', 'WAITING_FOR_USER', 'PAUSED'] },
          },
          orderBy: { updatedAt: 'desc' },
        });

        if (finalWait) {
          const ctx = (finalWait.context as any) || {};
          return {
            steps,
            done: false,
            waiting: true,
            waitingRequest: finalWait,
            waitEvent: ctx.waitEvent,
          };
        }

        return {
          steps,
          done: true,
          waiting: false,
          waitingRequest: null,
        };
      }

      steps++;

      // 3. Optional custom predicate check
      if (options?.until) {
        const latestReq = await this.prisma.request.findFirst({
          where: {
            ...(convId !== undefined ? { conversationId: convId } : {}),
          },
          orderBy: { updatedAt: 'desc' },
        });
        if (latestReq && options.until(latestReq)) {
          return {
            steps,
            done: latestReq.status === 'COMPLETED',
            waiting:
              latestReq.status === 'WAITING_FOR_EVENT' ||
              latestReq.status === 'WAITING_FOR_USER' ||
              latestReq.status === 'PAUSED',
            waitingRequest: latestReq,
            waitEvent: (latestReq.context as any)?.waitEvent,
          };
        }
      }
    }

    return {
      steps,
      done: false,
      waiting: false,
      waitingRequest: null,
    };
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
      if (!this.isStopped && this.timer) {
        setImmediate(() => this.pollRequests());
      }
    }
  }

  public async processRequest(request: any) {
    logger.debug(`[CuratorRequestProcessor] Processing request ${request.id}`);
    this.emit('request_start', { requestId: request.id });
    try {
      const req = await this.prisma.request.findUnique({
        where: { id: request.id },
        include: { user: true }
      });
      if (!req) throw new Error(`Request ${request.id} not found`);

      let agent: any = null;
      try {
        const totalAgents = await this.prisma.agent.count();
        const enabledCount = await this.prisma.agent.count({ where: { enabled: true } });
        if (totalAgents > 0 && enabledCount === 0) {
          logger.debug(`[CuratorRequestProcessor] Cancelling request ${req.id}: all agents are disabled.`);
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
          logger.debug(`[CuratorRequestProcessor] Cancelling request ${req.id}: associated agent '${agent.name}' is disabled.`);
          await this.prisma.request.update({
            where: { id: req.id },
            data: { status: 'CANCELLED', lockedBy: null, lockedAt: null }
          });
          this.emit('request_done', { requestId: req.id, success: false, status: 'CANCELLED' });
          return;
        }
      } catch (_) {}

      await this.ensureScriptReference(req);
      let resolvedNode: CuratorAstNode | null;
      try {
        resolvedNode = (await resolveRequestNode(this.prisma, req)).node;
      } catch (resolveErr: any) {
        const message = `Cannot resolve AST: ${resolveErr.message}`;
        logger.error(`[CuratorRequestProcessor] Request ${request.id} rejected: ${message}`);
        await this.saveResponse(req, `ERROR: ${message}`);
        await this.prisma.request.update({ where: { id: request.id }, data: { status: 'FAILED', lockedBy: null, lockedAt: null } });
        this.emit('request_done', { requestId: request.id, success: false, error: message });
        return;
      }
      const validation = validateCuratorAst(resolvedNode);
      if (!validation.valid) {
        const message = `Invalid Curator AST: ${validation.errors.join('; ')}`;
        logger.error(`[CuratorRequestProcessor] Request ${request.id} rejected: ${message}`);
        await this.saveResponse(req, `ERROR: ${message}`);
        await this.prisma.request.update({ where: { id: request.id }, data: { status: 'FAILED', lockedBy: null, lockedAt: null } });
        this.emit('request_done', { requestId: request.id, success: false, error: message });
        return;
      }
      const ast: CuratorAstNode = validation.node!;

      await this.execScope.run({ scriptId: req.scriptId, scriptVersion: req.scriptVersion }, () => curatorContext.run({
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

        const nodeTypes = ['Curator_Agent', 'Curator_Sequential', 'Curator_Parallel', 'Curator_Join', 'Curator_Tool', 'Curator_Script', 'Curator_Route', 'Curator_HumanInput', 'Curator_Graph', 'Curator_AgentRef', 'Curator_SetState', 'Curator_Interrupt', 'Curator_EmitEvent', 'Curator_WaitEvent', 'Curator_Assign', 'Curator_IfElse', 'Curator_While', 'Curator_Loop', 'Curator_ForEach', 'Curator_Call', 'Curator_Subscribe', 'Curator_Unsubscribe'];
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
            case 'Curator_Loop': return await this.handleLoop(ast as CuratorLoopNode, req);
            case 'Curator_ForEach': return await this.handleForEach(ast as any, req);
            case 'Curator_Call': return await this.handleCall(ast as CuratorCallNode, req);
            case 'Curator_Subscribe': return await this.handleSubscribe(ast as CuratorSubscribeNode, req);
            case 'Curator_Unsubscribe': return await this.handleUnsubscribe(ast as CuratorUnsubscribeNode, req);
            default:
              logger.warn(`[CuratorRequestProcessor] Node type ${ast.type} not implemented.`);
              await this.completeRequest(req.id, 'COMPLETED');
          }
        } else {
          logger.warn(`[CuratorRequestProcessor] Request ${req.id} has unknown AST type: ${(ast as any).type}. Skipping.`);
          await this.prisma.request.update({ where: { id: req.id }, data: { status: 'SKIPPED', lockedBy: null, lockedAt: null } });
        }
      }));
    } catch (error: any) {
      const msg = error.message || String(error);
      const retryMatch = msg.match(/Please retry in ([\d\.]+)s/);
      const isRateLimit = msg.includes('429') || msg.includes('Quota exceeded') || !!retryMatch;
      const MAX_RETRIES = 5;

      const req = await this.prisma.request.findUnique({ where: { id: request.id } });
      if (isRateLimit && req && req.retryCount < MAX_RETRIES) {
        let delayMs = 5000 * Math.pow(2, req.retryCount);
        if (retryMatch) delayMs = parseFloat(retryMatch[1]) * 1000 + 1000;
        const scheduledAt = new Date(this.clock() + delayMs);
        logger.debug(`[CuratorRequestProcessor] Rate limit. Rescheduling request ${request.id} in ${Math.round(delayMs/1000)}s (Attempt ${req.retryCount + 1}/${MAX_RETRIES})`);
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
    logger.debug(`[CuratorRequestProcessor] Emitting event: ${node.eventName}`);
    
    // Evaluate dynamic payload
    let payload = node.payload ?? req.context?.input;
    if (typeof node.payload === 'string' && ((node.payload.startsWith('(') && node.payload.endsWith('(context)')) || node.payload.startsWith('$') || node.payload.startsWith('{{'))) {
      payload = await this.evaluateExpressionAsync(node.payload, req);
    } else if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      const evaluatedPayload: Record<string, any> = {};
      for (const [k, v] of Object.entries(payload)) {
        if (typeof v === 'string' && (v.startsWith('{{') || v.startsWith('$') || (v.startsWith('(') && v.endsWith('(context)')))) {
          evaluatedPayload[k] = await this.evaluateExpressionAsync(v, req);
        } else {
          evaluatedPayload[k] = v;
        }
      }
      payload = evaluatedPayload;
    }
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      if (req.conversationId !== undefined && req.conversationId !== null) {
        if (payload.conversationId === undefined) {
          payload.conversationId = req.conversationId;
        }
        if (payload.tableId === undefined) {
          payload.tableId = String(req.conversationId);
        }
      }
      if (payload.sessionId === undefined) {
        const sessId = req.context?.sessionId || (req.context as any)?.state?.sessionId || req.sessionId;
        if (sessId) {
          payload.sessionId = sessId;
        }
      }
    }
    this.emit(node.eventName, payload);
    
    // Evaluate dynamic targetAgentId
    let targetAgentId = node.targetAgentId;
    if (typeof targetAgentId === 'string' && this.isDynamicExpr(targetAgentId)) {
      targetAgentId = await this.evaluateExpressionAsync(targetAgentId, req);
    }

    const result = await this.dispatchEvent(node.eventName, payload, req, targetAgentId);
    const record: CuratorStructuredResponse = { type: 'EVENT_EMITTED', ok: true, event: result };
    await this.saveResponse(req, JSON.stringify(record));
    await this.completeRequest(req.id, 'COMPLETED');
  }

  /**
   * Single event matcher for subscribe and wait (design 4.3):
   *  - EventSubscription rows (static + conversation-scoped) spawn handler Requests (`parentId` = emitter);
   *  - parked WAITING_FOR_EVENT / WAITING_FOR_USER Requests with a matching `waitEvent` are resumed.
   */
  public async dispatchEvent(eventName: string, payload: any, req: any, targetAgentId?: string, opts: DispatchEventOptions = {}): Promise<CuratorEventEmitResult> {
    const target = targetAgentId != null && targetAgentId !== '' ? String(targetAgentId) : null;
    const eventSeq = await this.logEvent(req.conversationId, eventName, payload, target, req.id ?? null);

    const subscriptions = this.prisma.eventSubscription
      ? await this.prisma.eventSubscription.findMany({
          where: {
            eventName,
            isActive: true,
            OR: [
              { conversationId: req.conversationId },
              { conversationId: null }
            ]
          },
          include: { script: true }
        })
      : [];

    const spawned: number[] = [];
    for (const sub of subscriptions) {
      if (target && String(sub.agentId) !== target) continue;
      if (!sub.script) continue;
      const alias = sub.payloadAs || 'event';

      if (sub.when) {
        const matches = await this.evaluateExpressionAsync(sub.when, {
          conversationId: req.conversationId,
          context: { [alias]: payload, event: payload, payload, params: { [alias]: payload } }
        });
        if (!matches) continue;
      }

      // The declaring Script's AST is the source of truth; reference its active version when versioned.
      let astData: any;
      let astPath: string | undefined;
      let scriptVersion: number | undefined;
      try {
        if (sub.script.currentVersion > 0) {
          const loaded = await getScriptVersionAst(this.prisma, sub.scriptId, sub.script.currentVersion);
          scriptVersion = loaded.version;
          astPath = entryAstPath(loaded.ast, sub.entry);
          if (this.astStorage === 'snapshot') {
            const entryNode = getEntry(loaded.ast, sub.entry ?? undefined).node;
            astData = loaded.ast.type === 'Curator_Module' ? expandInlineCalls(entryNode, loaded.ast as any) : entryNode;
          }
        } else {
          const legacy = typeof sub.script.ast === 'string' ? JSON.parse(sub.script.ast) : sub.script.ast;
          if (!legacy) continue;
          astData = getEntry(legacy, sub.entry ?? undefined).node;
        }
      } catch (err: any) {
        logger.warn(`[CuratorRequestProcessor] Subscription ${sub.id} for '${eventName}' skipped: ${err.message}`);
        continue;
      }

      const child = await this.createValidatedRequest({
        data: {
          userId: sub.userId,
          projectId: sub.projectId,
          conversationId: req.conversationId,
          parentId: req.id, // causality: spawned by this emit Request
          scriptId: sub.scriptId,
          scriptVersion,
          agentId: sub.agentId ?? undefined,
          status: 'NEW',
          ast: astData,
          // An addressed event spawns a private handler: it cannot read or write other flows' state.
          context: { params: { [alias]: payload }, input: payload, eventName, origin: 'AST', astPath, ...(target ? { __scope: target } : {}) }
        }
      });
      spawned.push(child.id);
    }

    // Wake up WAITING_FOR_EVENT and WAITING_FOR_USER requests matching waitEvent
    const waitingRequests = await this.prisma.request.findMany({
      where: {
        conversationId: req.conversationId,
        status: { in: ['WAITING_FOR_EVENT', 'WAITING_FOR_USER'] }
      }
    });

    const woken: number[] = [];
    for (const waitReq of waitingRequests) {
      if (opts.targetRequestId !== undefined && waitReq.id !== opts.targetRequestId) continue;
      const ctx = waitReq.context as any;
      const matches = ctx?.waitEvent === eventName || (opts.matchWait?.(ctx?.waitEvent, eventName, payload) ?? false);
      if (matches && target && this.identityOf(waitReq) !== target) continue;
      if (matches) {
        logger.debug(`[CuratorRequestProcessor] Waking up request ${waitReq.id} waiting for event ${eventName}`);
        const value = opts.waitValue ? opts.waitValue(payload) : payload;

        const aliasKey = ctx.payloadAlias || ctx.choiceAs || ctx.as;
        let newState = {};
        if (aliasKey) {
           newState = { [aliasKey]: value };
        }

        const updatedContext = { ...ctx };
        delete updatedContext.waitEvent;
        delete updatedContext.payloadAlias;
        updatedContext.__humanInputReceived__ = true;
        if (aliasKey) {
           updatedContext[aliasKey] = value;
           updatedContext.state = { ...(updatedContext.state || {}), ...newState };

           await this.writeState(waitReq.conversationId, ctx?.__scope, newState);
        }
        if (opts.contextPatch) {
          Object.assign(updatedContext, opts.contextPatch);
          if (updatedContext.state) updatedContext.state = { ...updatedContext.state, ...opts.contextPatch };
        }

        await this.prisma.request.update({
          where: { id: waitReq.id },
          data: { status: 'NEW', context: updatedContext }
        });
        woken.push(waitReq.id);
        if (eventSeq !== null) await this.advanceEventCursor(waitReq.id, eventSeq);
      }
    }

    logger.debug(`[CuratorRequestProcessor] Event '${eventName}': spawned ${spawned.length}, woke ${woken.length}`);
    return { eventName, spawned, woken };
  }

  /** Appends to the conversation's event log; returns its sequence id (null if the DB has no EventLog). */
  private async logEvent(conversationId: number, eventName: string, payload: any, target: string | null = null, source: number | null = null): Promise<number | null> {
    if (!this.prisma.eventLog || conversationId == null) return null;
    const row = await this.prisma.eventLog.create({
      data: { conversationId, eventName, payload: payload === undefined ? null : payload, target, source },
    });
    return row.id;
  }

  /** Request ids of a flow: the request and everything it notifies, stopping before a Join. */
  private async flowChain(reqId: number | null | undefined): Promise<Set<number>> {
    const ids = new Set<number>();
    let id = reqId ?? null;
    for (let depth = 0; id != null && depth < 500; depth++) {
      const r: any = await this.prisma.request.findUnique({ where: { id }, select: { ast: true, notifyId: true } });
      if (!r || (r.ast as any)?.type === 'Curator_Join') break;
      ids.add(id);
      id = r.notifyId;
    }
    return ids;
  }

  private async latestEventSeq(conversationId: number): Promise<number> {
    if (!this.prisma.eventLog) return 0;
    const last = await this.prisma.eventLog.findFirst({ where: { conversationId }, orderBy: { id: 'desc' } });
    return last?.id ?? 0;
  }

  /**
   * Raises the cursor of `reqId` and of every request it notifies (its flow, forward along notifyId),
   * stopping before a Join so parallel branches keep independent cursors.
   */
  private async advanceEventCursor(reqId: number, seq: number) {
    let id: number | null = reqId;
    for (let depth = 0; id != null && depth < 500; depth++) {
      const r: any = await this.prisma.request.findUnique({ where: { id }, select: { ast: true, notifyId: true } });
      if (!r || (r.ast as any)?.type === 'Curator_Join') return;
      await this.prisma.request.updateMany({
        where: { id, OR: [{ eventCursor: null }, { eventCursor: { lt: seq } }] },
        data: { eventCursor: seq },
      });
      id = r.notifyId;
    }
  }

  /**
   * The flow's cursor: the request's own, else the nearest one it notifies. When the flow never waited, falls
   * back to the last event logged before the flow's anchor (chain end / Join) was created, so events emitted
   * before its first wait are still delivered.
   */
  private async resolveEventCursor(reqId: number, conversationId: number, replay = false): Promise<number> {
    let id: number | null = reqId;
    let anchor: Date | null = null;
    for (let depth = 0; id != null && depth < 500; depth++) {
      const r: any = await this.prisma.request.findUnique({ where: { id }, select: { ast: true, notifyId: true, eventCursor: true, createdAt: true } });
      if (!r) break;
      anchor = r.createdAt;
      if ((r.ast as any)?.type === 'Curator_Join') break;
      if (r.eventCursor != null) return r.eventCursor;
      id = r.notifyId;
    }
    if (replay) return 0;
    if (!anchor) return this.latestEventSeq(conversationId);
    const before = await this.prisma.eventLog.findFirst({
      where: { conversationId, createdAt: { lt: anchor } },
      orderBy: { id: 'desc' },
    });
    return before?.id ?? 0;
  }

  private async handleWaitEvent(ast: any, req: any) {
    if (this.prisma.eventLog && !req.context?.__humanInputReceived__) {
      const cursor = await this.resolveEventCursor(req.id, req.conversationId, !!ast.replay);
      const identity = this.identityOf(req);
      const myFlow = await this.flowChain(req.id);
      // The emitting flow never hears its own events, but events other flows logged meanwhile are kept.
      const candidates = await this.prisma.eventLog.findMany({
        where: {
          conversationId: req.conversationId, eventName: ast.eventName, id: { gt: cursor },
          OR: identity ? [{ target: null }, { target: identity }] : [{ target: null }],
        },
        orderBy: { id: 'asc' },
      });
      let missed: any = null;
      for (const c of candidates) {
        if (c.source != null) {
          const theirs = c.source === req.id ? myFlow : await this.flowChain(c.source);
          if ([...theirs].some((id) => myFlow.has(id))) continue;
        }
        missed = c;
        break;
      }
      if (missed) {
        // Emitted while this flow was between waits: deliver it as if it had woken us.
        logger.debug(`[CuratorRequestProcessor] Request ${req.id} consumed buffered event '${ast.eventName}' (#${missed.id}).`);
        await this.advanceEventCursor(req.id, missed.id);
        const value = missed.payload;
        if (ast.payloadAlias) {
          await this.writeState(req.conversationId, this.parseContext(req.context).__scope, { [ast.payloadAlias]: value });
        }
        await this.saveResponse(req, typeof value === 'string' ? value : JSON.stringify(value ?? {}));
        await this.completeRequest(req.id, 'COMPLETED');
        return;
      }
      await this.advanceEventCursor(req.id, cursor);
    }
    if (req.context?.__humanInputReceived__) {
      delete req.context.__humanInputReceived__;
      // Woken by dispatchEvent: the payload is already bound to the alias in context/state.
      const received = ast.payloadAlias ? req.context[ast.payloadAlias] : req.context.input;
      await this.saveResponse(req, typeof received === 'string' ? received : JSON.stringify(received ?? {}));
      await this.completeRequest(req.id, 'COMPLETED');
      return;
    }
    logger.debug(`[CuratorRequestProcessor] Request ${req.id} paused, waiting for event '${ast.eventName}'.`);
    const updatedContext: any = { ...(req.context || {}), waitEvent: ast.eventName, payloadAlias: ast.payloadAlias };
    delete updatedContext.waitDeadline;
    if (ast.timeoutSeconds > 0) updatedContext.waitDeadline = new Date(this.clock() + ast.timeoutSeconds * 1000).toISOString();
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
      return new Date(this.clock() + amount * (msMap[unit] || 0));
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
          context: isFirst ? req.context : undefined,
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

    const parentScope = this.parseContext(req.context).__scope;
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
        ast: { type: 'Curator_Join', name: `${ast.name || 'parallel'}_join` },
        ...(parentScope != null ? { context: { __joinScope: parentScope } } : {})
      }
    });

    for (const [i, sub] of subAgents.entries()) {
      let nodeAst = sub as any;
      if (ast.prompt && !nodeAst.prompt) nodeAst.prompt = ast.prompt;
      // Isolated branches get a private scope named after the branch (unique within this parallel).
      const branchContext = ast.isolate
        ? { ...this.parseContext(req.context), __scope: String(nodeAst.name ?? `branch${i}`) }
        : req.context;
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
          context: branchContext,
          priority: nodeAst.priority ?? 0,
          scheduledAt: this.resolveScheduledAt(nodeAst) ?? null
        }
      });
    }
    // The join node assumes responsibility for notifying our parent.
    await this.completeRequest(req.id, 'COMPLETED', true);
  }

  private async handleJoin(ast: CuratorJoinNode, req: any) {
    logger.debug(`[CuratorRequestProcessor] Executing Join Node for request ${req.id}`);
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
      logger.debug(`[CuratorRequestProcessor] Route Node (Phase 1) for request ${req.id} - inserting router node.`);
      
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
    logger.debug(`[CuratorRequestProcessor] Route Node (Phase 2) for request ${req.id} - making decision.`);
    
    let decision = String(context.input || '').trim();
    try {
      const parsed = JSON.parse(decision);
      if (parsed && typeof parsed === 'object') {
        decision = parsed.route || parsed.output || parsed.text || decision;
      }
    } catch (e) {}

    logger.debug(`[CuratorRequestProcessor] Route decision: '${decision}'`);

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
        logger.debug(`[CuratorRequestProcessor] Graph Node ${req.id} finished state '${activeNode}'.`);
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

        logger.debug(`[CuratorRequestProcessor] Graph Node ${req.id} routed to '${routeDest}'.`);
        
        activeNode = routeDest;
      }

      // If we just finished a state node, look for its edge transition
      if (waitingFor === 'NODE') {
        const edge = ast.edges ? ast.edges[activeNode] : null;
        
        if (!edge || edge === '__end__') {
          logger.debug(`[CuratorRequestProcessor] Graph Node ${req.id} reached terminal state.`);
          await this.saveResponse(req, stateData);
          await this.completeRequest(req.id, 'COMPLETED');
          return;
        }

        if (typeof edge === 'string') {
          logger.debug(`[CuratorRequestProcessor] Graph Node ${req.id} statically transitioning to '${edge}'.`);
          activeNode = edge;
        } else {
          logger.debug(`[CuratorRequestProcessor] Graph Node ${req.id} spawning conditional router for '${activeNode}'.`);
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
        logger.debug(`[CuratorRequestProcessor] Graph Node ${req.id} reached __end__ before execution.`);
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

      logger.debug(`[CuratorRequestProcessor] Graph Node ${req.id} executing state '${activeNode}'.`);
      
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
    if (req.context?.__humanInputReceived__) {
      delete req.context.__humanInputReceived__;
      const asKey = ast.as || req.context.choiceAs || req.context.as;
      const inputVal = asKey ? req.context[asKey] : req.context.input;
      const responseStr = typeof inputVal === 'string' ? inputVal : JSON.stringify(inputVal || {});
      await this.saveResponse(req, responseStr);
      await this.completeRequest(req.id, 'COMPLETED');
      return;
    }

    let prompt = ast.prompt;
    if (typeof prompt === 'string' && (prompt.startsWith('{{') || prompt.startsWith('$') || (prompt.startsWith('(') && prompt.endsWith('(context)')))) {
      prompt = await this.evaluateExpressionAsync(prompt, req);
    } else if (typeof prompt === 'string') {
      prompt = (await this.interpolateTemplate(prompt, req)) || prompt;
    }

    // Evaluate dynamic choices expression if provided as string or closure
    let choices = ast.choices;
    if (typeof choices === 'string' && (choices.startsWith('$') || choices.startsWith('(') || choices.startsWith('context.') || choices.startsWith('state.'))) {
      choices = await this.evaluateExpressionAsync(choices, req);
    } else if (typeof choices === 'function') {
      choices = choices(req.context);
    }

    // Normalize choices array: convert strings to rich choice objects if needed
    if (Array.isArray(choices)) {
      choices = choices.map((c: any) => {
        if (typeof c === 'string') {
          return { id: c, label: c, value: c };
        }
        return c;
      });
    }

    logger.debug(`[CuratorRequestProcessor] Request ${req.id} presenting prompt/choices (${choices?.length ?? 0} choices) to ${ast.targetUserId ? `user ${ast.targetUserId}` : 'any user'} (${ast.inputType || 'choices'}).`);

    const choicePayload = {
      requestId: req.id,
      prompt,
      inputType: ast.inputType || 'choices',
      choices: choices || [],
      targetUserId: ast.targetUserId ?? null,
      as: ast.as,
      blocking: ast.blocking !== false,
      timeoutSeconds: ast.timeoutSeconds,
      conversationId: req.conversationId,
    };

    // Store choices and metadata in request context
    const updatedContext = {
      ...(req.context || {}),
      targetUserId: ast.targetUserId ?? null,
      activeChoices: choices || [],
      choicePrompt: prompt,
      choiceAs: ast.as,
      as: ast.as || (req.context as any)?.as,
      waitEvent: 'curator:choice',
    };

    // Emit real-time choice event to pub/sub channels and client shells
    this.emit('curator:human_input', choicePayload);
    this.emit('curator:choices', choicePayload);

    // If non-blocking, record response immediately and complete
    if (ast.blocking === false) {
      await this.saveResponse(req, JSON.stringify({ prompt, choices }));
      await this.completeRequest(req.id, 'COMPLETED');
      return;
    }

    // Blocking: suspend request awaiting human response or event
    delete (updatedContext as any).waitDeadline;
    if (ast.timeoutSeconds > 0) {
      (updatedContext as any).waitDeadline = new Date(this.clock() + ast.timeoutSeconds * 1000).toISOString();
    }
    await this.prisma.request.update({
      where: { id: req.id },
      data: { status: 'WAITING_FOR_USER', context: updatedContext }
    });
  }

  /**
   * Curator_AgentRef is normalized to Curator_Call through the agent's Script
   * (Agent has no AST of its own); the child Request runs with the agent as actor.
   */
  private async handleAgentRef(req: any, ast: any, context: any) {
    if (context?.callPending) return this.handleCall({ type: 'Curator_Call', ref: '', as: ast.as } as any, req);

    const agentDef = ast.agentName
      ? await this.prisma.agent.findFirst({
          where: { OR: [{ id: ast.agentName }, { name: ast.agentName }] },
          include: { script: { select: { name: true } } }
        })
      : null;
    if (!agentDef?.script?.name) {
      const reason = !ast.agentName ? 'Missing agentName parameter' : `Agent '${ast.agentName}' not found or has no script`;
      logger.error(`[CuratorRequestProcessor] AgentRef failed for request ${req.id}: ${reason}`);
      await this.saveResponse(req, `[Agent Error] ${reason}`);
      await this.completeRequest(req.id, 'FAILED');
      return;
    }
    return this.handleCall(
      { type: 'Curator_Call', ref: agentDef.script.name, args: { input: '$context.input' }, as: ast.as } as any,
      req,
      { agentId: agentDef.id }
    );
  }

  /** Q4: composite ad-hoc root ASTs become anonymous ScriptVersions; versioned roots record their version. */
  private async ensureScriptReference(req: any) {
    if (req.parentId || req.notifyId || !this.prisma.scriptVersion) return;
    try {
      if (req.scriptId) {
        if (req.scriptVersion) return;
        const script = await this.prisma.script.findUnique({ where: { id: req.scriptId }, select: { currentVersion: true } });
        if (!script?.currentVersion) return;
        await this.prisma.request.update({ where: { id: req.id }, data: { scriptVersion: script.currentVersion } });
        req.scriptVersion = script.currentVersion;
        return;
      }
      const ast = typeof req.ast === 'string' ? JSON.parse(req.ast) : req.ast;
      // Light single-tool Requests stay snapshot-only (no script per distinct argument set).
      if (!ast?.type || ast.type === 'Curator_Tool') return;
      const saved = await saveAdhocScript(this.prisma, ast, { userId: req.userId, projectId: req.projectId });
      await this.prisma.request.update({ where: { id: req.id }, data: { scriptId: saved.scriptId, scriptVersion: saved.version } });
      req.scriptId = saved.scriptId;
      req.scriptVersion = saved.version;
    } catch (err: any) {
      logger.warn(`[CuratorRequestProcessor] Request ${req.id}: script reference not recorded: ${err.message}`);
    }
  }

  private isDynamicExpr(v: unknown): v is string {
    return typeof v === 'string' && (v.startsWith('{{') || v.startsWith('$') || (v.startsWith('(') && v.endsWith('(context)')));
  }

  /** Evaluates `$context...` / `{{ }}` values of an args object in the caller's context. */
  private async evaluateArgs(args: Record<string, any> | undefined, req: any): Promise<Record<string, any>> {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(args || {})) {
      out[k] = this.isDynamicExpr(v) ? await this.evaluateExpressionAsync(v, req) : v;
    }
    return out;
  }

  /** Binds call args to declared params (defaults, required). Undeclared args pass through. */
  private async bindParams(spec: Record<string, CuratorParamSpec> | undefined, args: Record<string, any> | undefined, req: any) {
    const params = await this.evaluateArgs(args, req);
    for (const [name, p] of Object.entries(spec || {})) {
      if (params[name] === undefined && p?.default !== undefined) params[name] = p.default;
      if (params[name] === undefined && p?.required) throw new Error(`Missing required param '${name}'`);
    }
    return params;
  }

  private async failRequest(req: any, reason: string) {
    logger.error(`[CuratorRequestProcessor] Request ${req.id} failed: ${reason}`);
    await this.saveResponse(req, `ERROR: ${reason}`);
    await this.completeRequest(req.id, 'FAILED');
  }

  /**
   * Paths B/C: one direct tool call (REPL, CLI, API) as a light Request, executed synchronously through
   * the same handler as AST tool nodes (RBAC, approval gate, secrets, Response). Throws on tool error
   * or when access is denied; returns status WAITING_FOR_USER when approval is required.
   */
  public async runToolRequest(input: RunToolRequestInput): Promise<RunToolRequestResult> {
    if (!this.engine.tools.get(input.toolName)) throw new Error(`Tool '${input.toolName}' not found`);
    // Created locked (WAITING + lockedBy) so the poller never picks it up concurrently.
    const created = await this.prisma.request.create({
      data: {
        userId: input.userId,
        projectId: input.projectId ?? null,
        conversationId: input.conversationId,
        agentId: input.agentId ?? undefined,
        toolName: input.toolName,
        status: 'WAITING',
        lockedBy: this.workerId,
        lockedAt: new Date(),
        ast: { type: 'Curator_Tool', toolName: input.toolName, args: input.args ?? {} },
        context: { ...(input.context || {}), origin: input.origin, literalArgs: true }
      }
    });
    this.inflight.set(created.id, { runtimeArgs: input.runtimeArgs, runtimeContext: input.runtimeContext, broadcastToolEvents: input.broadcastToolEvents });
    try {
      await this.processRequest({ id: created.id });
      const flight = this.inflight.get(created.id);
      if (flight?.error) throw flight.error;

      const done = await this.prisma.request.findUnique({
        where: { id: created.id },
        include: { responses: { orderBy: { createdAt: 'desc' }, take: 1 } }
      });
      const content = done?.responses?.[0]?.content ?? null;
      let parsed: any = content;
      if (typeof content === 'string') {
        try { parsed = JSON.parse(content); } catch { /* plain text */ }
      }
      const record = CuratorRequestProcessor.isStructuredRecord(parsed) ? (parsed as CuratorStructuredResponse) : undefined;
      if (done?.status === 'FAILED') {
        throw new Error(record?.reason || (typeof content === 'string' ? content : `Tool '${input.toolName}' failed`));
      }
      return {
        requestId: created.id,
        status: done?.status ?? 'UNKNOWN',
        result: record ? undefined : (flight?.raw !== undefined ? flight.raw : parsed),
        record
      };
    } finally {
      this.inflight.delete(created.id);
    }
  }

  /**
   * One emitted event (REPL, CLI, API) recorded as a Request whose Response is EVENT_EMITTED.
   * Uses the same matcher as Curator_EmitEvent (subscriptions + waits).
   */
  public async emitEventRequest(input: EmitEventRequestInput): Promise<CuratorEventEmitResult & { requestId: number }> {
    const req = await this.prisma.request.create({
      data: {
        userId: input.userId,
        projectId: input.projectId ?? null,
        conversationId: input.conversationId,
        agentId: input.agentId ?? undefined,
        status: 'WAITING',
        lockedBy: this.workerId,
        lockedAt: new Date(),
        ast: { type: 'Curator_EmitEvent', eventName: input.eventName, payload: input.payload ?? null },
        context: { origin: input.origin }
      }
    });
    try {
      const result = await this.dispatchEvent(input.eventName, input.payload, req, input.targetAgentId, input);
      if (input.broadcast !== false) this.emit(input.eventName, input.payload);
      const record: CuratorStructuredResponse = { type: 'EVENT_EMITTED', ok: true, event: result };
      await this.saveResponse(req, JSON.stringify(record));
      await this.completeRequest(req.id, 'COMPLETED');
      return { ...result, requestId: req.id };
    } catch (err: any) {
      await this.failRequest(req, `Emit '${input.eventName}': ${err.message}`);
      throw err;
    }
  }

  /**
   * Curator_Call (child mode): the callee runs as its own Request (parentId/notifyId = caller) with an
   * isolated context `{ params }`. Phase 2 writes the callee's result to `as`.
   * Inline calls never reach here: they are macro-expanded when the node is resolved.
   */
  private async handleCall(ast: CuratorCallNode, req: any, opts: { agentId?: string } = {}) {
    const ctx = (typeof req.context === 'string' ? JSON.parse(req.context) : req.context) || {};

    if (ctx.callPending) {
      // Phase 2: the callee chain finished; the latest Response of a request that notified us is the result.
      const last = await this.prisma.request.findFirst({
        where: { notifyId: req.id, status: 'COMPLETED', responses: { some: {} } },
        orderBy: { id: 'desc' },
        include: { responses: { orderBy: { createdAt: 'desc' }, take: 1 } }
      });
      let result: any = last?.responses?.[0]?.content ?? null;
      if (typeof result === 'string') {
        try { result = JSON.parse(result); } catch { /* plain text result */ }
      }
      if (ctx.callReturns && last) {
        const lastCtx = typeof last.context === 'string' ? JSON.parse(last.context) : last.context;
        result = await this.evaluateExpressionAsync(ctx.callReturns, { conversationId: last.conversationId, context: lastCtx || {} });
      }
      const as = ast.as ?? ctx.callAs;
      const { callPending: _p, callReturns: _r, callAs: _a, ...rest } = ctx;
      const newContext: any = { ...rest };
      if (as) {
        newContext[as] = result;
        const conv = await this.prisma.conversation.findUnique({ where: { id: req.conversationId } });
        const newState = { ...this.getConversationState(conv), [as]: result };
        await this.updateConversationState(req.conversationId, newState);
        newContext.state = newState;
      }
      await this.prisma.request.update({ where: { id: req.id }, data: { context: newContext } });
      await this.saveResponse(req, typeof result === 'string' ? result : JSON.stringify(result ?? null));
      await this.completeRequest(req.id, 'COMPLETED');
      return;
    }

    const depth = (ctx.callDepth ?? 0) + 1;
    if (depth > this.maxCallDepth) return this.failRequest(req, `Call depth ${depth} exceeds maxCallDepth ${this.maxCallDepth} at '${ast.ref}'`);

    let target: Awaited<ReturnType<typeof resolveRef>>;
    let params: Record<string, any>;
    let astPath: string;
    let rootAst: CuratorAstNode;
    try {
      target = await resolveRef(this.prisma, ast.ref, { scriptId: req.scriptId, scriptVersion: req.scriptVersion });
      params = await this.bindParams(target.params, ast.args, req);
      rootAst = (await getScriptVersionAst(this.prisma, target.scriptId, target.version)).ast;
      astPath = entryAstPath(rootAst, target.entry);
    } catch (err: any) {
      return this.failRequest(req, `Call '${ast.ref}': ${err.message}`);
    }

    // Park the caller first so a fast callee can never complete before we are WAITING.
    await this.prisma.request.update({
      where: { id: req.id },
      data: {
        status: 'WAITING', pendingDependencies: 1, lockedBy: null, lockedAt: null,
        context: { ...ctx, callPending: true, callReturns: target.returns ?? null, callAs: ast.as ?? null }
      }
    });

    await this.createValidatedRequest({
      data: {
        userId: req.userId,
        projectId: req.projectId,
        conversationId: req.conversationId,
        parentId: req.id,
        notifyId: req.id,
        scriptId: target.scriptId,
        scriptVersion: target.version,
        agentId: opts.agentId ?? req.agentId ?? undefined,
        status: 'NEW',
        pendingDependencies: 0,
        ast: this.astStorage === 'snapshot'
          ? (rootAst.type === 'Curator_Module' ? expandInlineCalls(target.node, rootAst as any) : target.node)
          : undefined,
        // Isolated: the callee sees only its params (plus conversation state), never the caller's context.
        context: { params, input: params.input, origin: 'AST', ref: ast.ref, astPath, callDepth: depth }
      }
    });
    // No Response while parked: the poller treats a WAITING Request with a Response as answered.
    // Lineage is the child's parentId; the result Response is written in phase 2.
  }

  /** Resolves a handler ref to its Script row id and entry (local refs use the executing script). */
  private async resolveHandler(handler: string, req: any): Promise<{ scriptId: number; entry: string | null }> {
    const parsed = parseCuratorRef(handler);
    if (!parsed) throw new Error(`Invalid handler ref '${handler}'`);
    if (!parsed.script) {
      if (!req.scriptId) throw new Error(`Local handler '${handler}' used outside a stored script`);
      return { scriptId: req.scriptId, entry: parsed.entry ?? null };
    }
    const script = await this.prisma.script.findUnique({ where: { name: parsed.script }, select: { id: true } });
    if (!script) throw new Error(`Script '${parsed.script}' not found`);
    return { scriptId: script.id, entry: parsed.entry ?? null };
  }

  /** Dynamic Curator_Subscribe: materializes a conversation-scoped EventSubscription bound to the handler's Script. */
  private async handleSubscribe(ast: CuratorSubscribeNode, req: any) {
    if (!this.prisma.eventSubscription) return this.failRequest(req, 'EventSubscription model is not available');
    if (ast.scope === 'project') {
      return this.failRequest(req, `Project-scoped subscriptions must be declared in Curator_Module.subscriptions (static)`);
    }
    try {
      const { scriptId, entry } = await this.resolveHandler(ast.handler, req);
      const where = { scriptId, entry, eventName: ast.eventName, conversationId: req.conversationId };
      const data = {
        isActive: true,
        when: ast.when ?? null,
        payloadAs: ast.as ?? null,
        userId: req.userId,
        projectId: req.projectId ?? null,
        agentId: req.agentId ?? null
      };
      const found = await this.prisma.eventSubscription.findFirst({ where });
      const row = found
        ? await this.prisma.eventSubscription.update({ where: { id: found.id }, data })
        : await this.prisma.eventSubscription.create({ data: { ...where, ...data } });
      const record: CuratorStructuredResponse = {
        type: 'SUBSCRIBED',
        ok: true,
        metadata: { subscriptionId: row.id, eventName: ast.eventName, handler: ast.handler }
      };
      await this.saveResponse(req, JSON.stringify(record));
      await this.completeRequest(req.id, 'COMPLETED');
    } catch (err: any) {
      return this.failRequest(req, `Subscribe '${ast.eventName}': ${err.message}`);
    }
  }

  /** Dynamic Curator_Unsubscribe: deactivates conversation-scoped subscriptions (all, or for one handler). */
  private async handleUnsubscribe(ast: CuratorUnsubscribeNode, req: any) {
    if (!this.prisma.eventSubscription) return this.failRequest(req, 'EventSubscription model is not available');
    try {
      const handlerWhere = ast.handler ? await this.resolveHandler(ast.handler, req) : {};
      const res = await this.prisma.eventSubscription.updateMany({
        where: { eventName: ast.eventName, conversationId: req.conversationId, isActive: true, ...handlerWhere },
        data: { isActive: false }
      });
      const record: CuratorStructuredResponse = {
        type: 'UNSUBSCRIBED',
        ok: true,
        metadata: { eventName: ast.eventName, handler: ast.handler ?? null, count: res?.count ?? 0 }
      };
      await this.saveResponse(req, JSON.stringify(record));
      await this.completeRequest(req.id, 'COMPLETED');
    } catch (err: any) {
      return this.failRequest(req, `Unsubscribe '${ast.eventName}': ${err.message}`);
    }
  }

  private async handleScript(ast: CuratorScriptNode, req: any) {
    if (req.context?.spawnedChild) {
      // Phase 2: Child finished. Output is in req.context.input.
      const outputStr = typeof req.context.input === 'string' ? req.context.input : JSON.stringify(req.context.input || {});
      await this.saveResponse(req, outputStr);
      await this.completeRequest(req.id, 'COMPLETED');
      return;
    }

    logger.debug(`[CuratorRequestProcessor] Executing Script Node (${ast.language || 'javascript'}) for request ${req.id}`);
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
      
      const nodeTypes = ['Curator_Agent', 'Curator_Sequential', 'Curator_Parallel', 'Curator_Join', 'Curator_Tool', 'Curator_Script', 'Curator_Route', 'Curator_HumanInput', 'Curator_Graph', 'Curator_AgentRef', 'Curator_SetState', 'Curator_EmitEvent', 'Curator_WaitEvent', 'Curator_Interrupt', 'Curator_Assign',       'Curator_IfElse', 'Curator_While', 'Curator_Loop', 'Curator_ForEach'];
      if (output && typeof output === 'object' && output.type && nodeTypes.includes(output.type)) {
        logger.debug(`[CuratorRequestProcessor] Script generated a valid AST node of type ${output.type}. Spawning as child...`);
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

  private async checkToolRoleAccess(req: any, toolName: string, tool: any): Promise<{ allowed: boolean; reason?: string; roleNames?: string[] }> {
    if (!this.prisma) return { allowed: true };
    const accessLevel = (tool as any).accessLevel || 'safe_write';
    const requiresConfirmation = (tool as any).requiresConfirmation || (tool as any).requiresHumanApproval || accessLevel === 'destructive' || accessLevel === 'elevated';
    const effectiveAgentId = req.agentId || req.context?.agentId || req.context?.activeAgentId || req.context?.actorId;
    const effectiveUserId = req.userId || req.context?.userId;
    const effectiveProjectId = req.projectId || req.context?.projectId;
    try {
      return await AgentRoleService.validateActorToolAccess(
        this.prisma,
        {
          agentId: effectiveAgentId ? String(effectiveAgentId) : undefined,
          userId: effectiveUserId ? String(effectiveUserId) : undefined,
          projectId: effectiveProjectId ? String(effectiveProjectId) : undefined,
        },
        toolName,
        { name: toolName, requiredRole: (tool as any).requiredRole, accessLevel, requiresHumanApproval: requiresConfirmation }
      );
    } catch (roleErr) {
      logger.warn('[CuratorRequestProcessor] AgentRoleService check failed:', roleErr);
      return { allowed: true };
    }
  }

  private async checkToolAccess(req: any, toolName: string, tool: any): Promise<{ allowed: boolean; requiresConfirmation: boolean; reason?: string; approvalScope?: string; roles?: string[] }> {
    const accessLevel = (tool as any).accessLevel || 'safe_write';
    const requiresConfirmation = (tool as any).requiresConfirmation || (tool as any).requiresHumanApproval || accessLevel === 'destructive' || accessLevel === 'elevated';

    // 1. Actor Role Whitelisting (Agent or Human User)
    if (this.prisma) {
      const roleCheck = await this.checkToolRoleAccess(req, toolName, tool);
      if (!roleCheck.allowed) {
        // Recorded by the caller as a TOOL_BLOCKED Response.
        return {
          allowed: false,
          requiresConfirmation: false,
          reason: roleCheck.reason,
          roles: roleCheck.roleNames
        };
      }
    }

    // 2. Human-in-the-Loop Gating: Check if tool mandates human confirmation / approval
    let approvalResult: any = { approved: false };
    if (requiresConfirmation) {
      approvalResult = await ApprovalService.checkApproval(this.prisma, {
        toolName,
        agentId: req.agentId ? String(req.agentId) : null,
        conversationId: req.conversationId,
        context: req.context
      });

      if (!approvalResult.approved) {
        // Recorded by the caller as an APPROVAL_REQUIRED Response.
        return {
          allowed: false,
          requiresConfirmation: true,
          reason: approvalResult.reason || `Tool '${toolName}' (${accessLevel}) requires user confirmation before execution.`
        };
      }
    }

    // 3. Check granular actor permissions in database if present
    try {
      const totalPermissionsCount = await this.prisma.permission?.count?.() || 0;
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

    return { 
      allowed: true, 
      requiresConfirmation: false, 
      approvalScope: approvalResult.scope 
    };
  }

  /**
   * Approval waits (WAITING_FOR_USER + context.pendingToolCall) are resumed only by an approval.
   * Past `pendingToolCall.expiresAt` they are closed with an APPROVAL_EXPIRED Response, and the AST decides
   * the outcome via the tool node's `onApprovalExpired`: 'fail' (default) fails the step, 'continue'
   * completes it with `{ ok: false, expired: true }` under `as` / toolName so the flow can branch.
   */
  private async expireApprovalWaits() {
    const parked = await this.prisma.request.findMany({
      where: { status: 'WAITING_FOR_USER' },
      orderBy: { updatedAt: 'asc' },
      take: 50
    });
    const now = this.clock();
    for (const req of parked) {
      const ctx = (typeof req.context === 'string' ? JSON.parse(req.context) : req.context) || {};
      const pending = ctx.pendingToolCall;
      if (!pending?.expiresAt || Date.parse(pending.expiresAt) > now) continue;

      // Claim it atomically so only one worker expires it.
      const claimed = await this.prisma.request.updateMany({
        where: { id: req.id, status: 'WAITING_FOR_USER' },
        data: { status: 'WAITING', lockedBy: this.workerId, lockedAt: new Date() }
      });
      if (claimed.count === 0) continue;

      logger.debug(`[CuratorRequestProcessor] Approval wait for '${pending.name}' on request ${req.id} expired.`);
      const record: CuratorStructuredResponse = {
        type: 'APPROVAL_EXPIRED', ok: false, tool: pending.name, expiresAt: pending.expiresAt, reason: ctx.reason
      };
      const nextCtx: any = { ...ctx };
      delete nextCtx.pendingToolCall;
      const proceed = pending.onExpired === 'continue';
      if (proceed) {
        const outcome = { ok: false, expired: true, type: 'APPROVAL_EXPIRED', tool: pending.name };
        nextCtx[pending.name] = outcome;
        if (pending.as) nextCtx[pending.as] = outcome;
      }
      await this.prisma.request.update({ where: { id: req.id }, data: { context: nextCtx } });
      req.context = nextCtx;
      await this.saveResponse(req, JSON.stringify(record));
      await this.completeRequest(req.id, proceed ? 'COMPLETED' : 'FAILED');
    }
  }

  /**
   * Human prompts with `timeoutSeconds` park with `context.waitDeadline`. Past it, the prompt completes with a
   * HUMAN_TIMEOUT Response (nothing is bound to `as`), so the script can re-ask (loop), nudge or give up.
   */
  private async expireHumanWaits() {
    const parked = await this.prisma.request.findMany({
      where: { status: { in: ['WAITING_FOR_USER', 'WAITING_FOR_EVENT'] } },
      orderBy: { updatedAt: 'asc' },
      take: 50
    });
    const now = this.clock();
    for (const req of parked) {
      const ctx = this.parseContext(req.context);
      if (!ctx.waitDeadline || ctx.pendingToolCall || Date.parse(ctx.waitDeadline) > now) continue;

      const claimed = await this.prisma.request.updateMany({
        where: { id: req.id, status: req.status },
        data: { status: 'WAITING', lockedBy: this.workerId, lockedAt: new Date() }
      });
      if (claimed.count === 0) continue;

      const isEventWait = req.status === 'WAITING_FOR_EVENT';
      logger.debug(`[CuratorRequestProcessor] Human prompt on request ${req.id} timed out.`);
      const nextCtx: any = { ...ctx };
      delete nextCtx.waitEvent;
      delete nextCtx.waitDeadline;
      delete nextCtx.payloadAlias;
      await this.prisma.request.update({ where: { id: req.id }, data: { context: nextCtx } });
      req.context = nextCtx;
      const record: CuratorStructuredResponse = { type: isEventWait ? 'WAIT_TIMEOUT' : 'HUMAN_TIMEOUT', ok: false, deadline: ctx.waitDeadline, reason: isEventWait ? ctx.waitEvent : ctx.choicePrompt };
      await this.saveResponse(req, JSON.stringify(record));
      await this.completeRequest(req.id, 'COMPLETED');
    }
  }

  /**
   * Retention cleanup (policy `readOnlyRequests: 'prune'`): deletes COMPLETED direct (root, non-workflow)
   * tool Requests of read-only tools older than `readOnlyTtlMs`, with their Responses.
   * Workflow Requests, failures and anything with children are never pruned. Runs at most every 10 minutes.
   */
  public async pruneReadOnlyRequests(force = false): Promise<number> {
    if (this.retention.readOnlyRequests !== 'prune') return 0;
    if (!force && Date.now() - this.lastPruneAt < 10 * 60 * 1000) return 0;
    this.lastPruneAt = Date.now();

    const readOnlyTools: string[] = [];
    for (const [name, tool] of this.engine.tools.entries()) {
      const level = String((tool as any)?.accessLevel || '').toLowerCase();
      if (level === 'safe_read' || level === 'read_only' || level === 'readonly') readOnlyTools.push(name);
    }
    if (readOnlyTools.length === 0) return 0;

    const cutoff = new Date(Date.now() - this.retention.readOnlyTtlMs);
    const victims = await this.prisma.request.findMany({
      where: {
        status: 'COMPLETED',
        toolName: { in: readOnlyTools },
        parentId: null,
        scriptId: null,
        createdAt: { lt: cutoff },
        children: { none: {} }
      },
      select: { id: true },
      take: 500
    });
    if (victims.length === 0) return 0;
    const ids = victims.map((v: any) => v.id);
    await this.prisma.response.deleteMany({ where: { requestId: { in: ids } } });
    const deleted = await this.prisma.request.deleteMany({ where: { id: { in: ids } } });
    logger.debug(`[CuratorRequestProcessor] Retention: pruned ${deleted.count} read-only tool request(s) older than ${cutoff.toISOString()}.`);
    return deleted.count;
  }

  private async handleTool(ast: CuratorToolNode, req: any) {
    logger.debug(`[CuratorRequestProcessor] Executing Tool '${ast.toolName}' for request ${req.id}`);
    const tool = this.engine.tools.get(ast.toolName);
    if (!tool) throw new Error(`Tool ${ast.toolName} not found in dynamic registry.`);

    let toolArgs = ast.args || { url: req.context?.input || '' };
    // Direct calls (REPL/CLI/API) carry literal args: a value like "$100" must not be evaluated.
    const literalArgs = req.context?.literalArgs === true;
    const inflight = this.inflight.get(req.id);
    
    // Evaluate string expressions in toolArgs — supports both {{expr}} templates and (fn)(context) patterns
    let evaluatedArgs: Record<string, any> = {};
    if (typeof toolArgs === 'string' && (toolArgs.startsWith('{{') || toolArgs.startsWith('$') || (toolArgs.startsWith('(') && toolArgs.endsWith('(context)')))) {
      const resolved = await this.evaluateExpressionAsync(toolArgs, req);
      evaluatedArgs = (resolved && typeof resolved === 'object' && !Array.isArray(resolved)) ? resolved : { input: resolved };
    } else if (toolArgs && typeof toolArgs === 'object') {
      for (const [k, v] of Object.entries(toolArgs)) {
        if (literalArgs) { evaluatedArgs[k] = v; continue; }
        if (typeof v === 'string' && (v.startsWith('{{') || v.startsWith('$') || (v.startsWith('(') && v.endsWith('(context)')))) {
          evaluatedArgs[k] = await this.evaluateExpressionAsync(v, req);
        } else if (typeof v === 'object' && v !== null) {
          // Recursively resolve template strings inside nested arg objects
          const resolved: Record<string, any> = {};
          for (const [ik, iv] of Object.entries(v as Record<string, any>)) {
            if (typeof iv === 'string' && (iv.startsWith('{{') || iv.startsWith('$') || (iv.startsWith('(') && iv.endsWith('(context)')))) {
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
    }

    // RBAC & Tool confirmation gate
    const accessCheck = await this.checkToolAccess(req, ast.toolName, tool);
    if (!accessCheck.allowed) {
      if (accessCheck.requiresConfirmation) {
        logger.debug(`[CuratorRequestProcessor] Request ${req.id} pausing on WAITING_FOR_USER for tool '${ast.toolName}'.`);
        const ttlMs = ast.approvalTtlMs ?? (tool as any).approvalTtlMs ?? this.approvalTtlMs;
        const expiresAt = ttlMs > 0 ? new Date(this.clock() + ttlMs).toISOString() : undefined;
        await this.prisma.request.update({
          where: { id: req.id },
          data: {
            status: 'WAITING_FOR_USER',
            lockedBy: null,
            lockedAt: null,
            context: {
              ...req.context,
              pendingToolCall: {
                name: ast.toolName,
                args: evaluatedArgs,
                as: ast.as,
                expiresAt,
                onExpired: ast.onApprovalExpired ?? 'fail'
              },
              reason: accessCheck.reason
            }
          }
        });
        // Audit record only: the poller never treats this Response as the approval (see pendingToolCall guard).
        await this.saveResponse(req, JSON.stringify({
          type: 'APPROVAL_REQUIRED', ok: false, tool: ast.toolName, reason: accessCheck.reason, expiresAt
        } satisfies CuratorStructuredResponse));
        return;
      } else {
        await this.saveResponse(req, JSON.stringify({
          type: 'TOOL_BLOCKED', ok: false, tool: ast.toolName, reason: accessCheck.reason, roles: accessCheck.roles
        } satisfies CuratorStructuredResponse));
        await this.completeRequest(req.id, 'FAILED');
        return;
      }
    }

    let result = '';
    let rawOutput: any = undefined;
    let hydratedSecrets = new Map<string, string>();
    try {
      // Late-binding secret hydration: replaces $secret:XYZ, {{secrets.XYZ}}, etc.
      const hydration = await SecretService.hydrate(evaluatedArgs, {
        projectId: req.projectId,
        userId: req.userId,
        agentId: req.agentId,
        prisma: this.prisma
      });
      hydratedSecrets = hydration.secretsMap;

      rawOutput = await tool.runAsync({
        args: { ...hydration.hydrated, ...(inflight?.runtimeArgs || {}) },
        toolContext: {
          ...this.toolContextExtras,
          conversationId: req.conversationId,
          userId: req.userId,
          agentId: req.agentId,
          projectId: req.projectId,
          prisma: this.prisma,
          context: req.context,
          state: req.context?.state,
          ...(inflight?.runtimeContext || {})
        }
      });
      if (inflight) inflight.raw = rawOutput;
      result = typeof rawOutput === 'string' ? rawOutput : JSON.stringify(rawOutput);

      if (rawOutput && typeof rawOutput === 'object' && (rawOutput as any).event && inflight?.broadcastToolEvents !== false) {
        const evt = (rawOutput as any).event;
        const eventName = typeof evt === 'string' ? evt : evt.name;
        const payload = typeof evt === 'object' && evt.payload !== undefined ? evt.payload : rawOutput;
        this.emit(eventName, payload);
      }
    } catch(e: any) {
      if (inflight) inflight.error = e;
      result = `[Tool Error] ${e.message}`;
    }

    // Egress scrubbing: mask any reflected secrets before writing to DB responses or context
    result = SecretService.mask(result, hydratedSecrets);

    // Store tool output in req.context under a short name derived from the tool name.
    // This is best-effort: if the DB update fails (e.g. P2028), we still proceed with
    // saveResponse + completeRequest using the in-memory context.
    if (rawOutput !== undefined) {
      const sanitizedOutput = typeof rawOutput === 'string'
        ? SecretService.mask(rawOutput, hydratedSecrets)
        : SecretService.sanitizeContext(rawOutput, hydratedSecrets);
      const updatedContext = { ...(req.context || {}) };
      // An approved wait is consumed once the tool has run.
      delete updatedContext.pendingToolCall;
      updatedContext[ast.toolName] = sanitizedOutput;

      // Allow AST node (`as` / `outputKey`) or tool definition (`outputKey` / `contextKey`) to define an alias
      const toolAlias = (ast as any).as || (ast as any).outputKey || (tool as any)?.outputKey || (tool as any)?.contextKey;
      if (toolAlias && typeof toolAlias === 'string') {
        updatedContext[toolAlias] = sanitizedOutput;
      }

      if (sanitizedOutput && typeof sanitizedOutput === 'object' && !Array.isArray(sanitizedOutput)) {
        Object.assign(updatedContext, sanitizedOutput);
      }
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

    // Consume ONETIME approval if used
    if (accessCheck.approvalScope === 'ONETIME' && req.context) {
      delete req.context.__humanApproved__;
      if (Array.isArray(req.context.__approvedTools__)) {
        req.context.__approvedTools__ = req.context.__approvedTools__.filter((t: string) => t !== ast.toolName);
      }
    }

    // The Response below is the audit record of this tool execution.
    await this.saveResponse(req, result);
    await this.completeRequest(req.id, 'COMPLETED');
  }

  private async handleSetState(ast: any, req: any) {
    logger.debug(`[CuratorRequestProcessor] Setting state for request ${req.id}`);
    let evaluatedState: Record<string, any> = {};
    if (typeof ast.state === 'string' && (ast.state.startsWith('{{') || ast.state.startsWith('$') || (ast.state.startsWith('(') && ast.state.endsWith('(context)')))) {
      const res = await this.evaluateExpressionAsync(ast.state, req);
      if (res && typeof res === 'object' && !Array.isArray(res)) {
        evaluatedState = res;
      }
    } else if (ast.state && typeof ast.state === 'object') {
      for (const [k, v] of Object.entries(ast.state)) {
        if (typeof v === 'string' && (v.startsWith('{{') || v.startsWith('$') || (v.startsWith('(') && v.endsWith('(context)')))) {
          evaluatedState[k] = await this.evaluateExpressionAsync(v, req);
        } else {
          evaluatedState[k] = v;
        }
      }
    }

    if (Object.keys(evaluatedState).length > 0) {
      await this.writeState(req.conversationId, this.parseContext(req.context).__scope, evaluatedState);
      await this.saveResponse(req, JSON.stringify({ status: 'State updated', state: evaluatedState }));
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

    logger.debug(`[CuratorRequestProcessor] Interrupt (mode=${mode}, priority=${priority}) for conversation ${req.conversationId}`);

    if (mode === 'play') {
      // Resume all PAUSED requests in this conversation
      const resumed = await this.prisma.request.updateMany({
        where: {
          conversationId: req.conversationId,
          status: 'PAUSED'
        },
        data: { status: 'NEW', lockedBy: null, lockedAt: null }
      });
      logger.debug(`[CuratorRequestProcessor] Resumed ${resumed.count} paused requests.`);
      await this.saveResponse(req, JSON.stringify({ status: 'play', resumed: resumed.count }));
      await this.completeRequest(req.id, 'COMPLETED');
      return;
    }

    if (mode === 'pause') {
      // Wake-up after the handler: the pause already happened on the first pass.
      if (req.context?.interruptHandled) {
        await this.saveResponse(req, JSON.stringify({ status: 'pause', handled: true }));
        await this.completeRequest(req.id, 'COMPLETED');
        return;
      }

      // Suspend all NEW requests below threshold
      const paused = await this.prisma.request.updateMany({
        where: {
          conversationId: req.conversationId,
          status: 'NEW',
          priority: { lt: cancelThreshold }
        },
        data: { status: 'PAUSED' }
      });
      logger.debug(`[CuratorRequestProcessor] Paused ${paused.count} requests.`);

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
        // Park until the handler finishes; `interruptHandled` makes the wake-up complete instead of pausing again.
        // No Response while parked: the poller treats a WAITING Request with a Response as answered.
        await this.prisma.request.update({
          where: { id: req.id },
          data: { status: 'WAITING', pendingDependencies: 1, lockedBy: null, lockedAt: null, context: { ...(req.context || {}), interruptHandled: true } }
        });
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
    logger.debug(`[CuratorRequestProcessor] Cancelled ${cancelled.count} lower-priority requests.`);

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
        // State variable or fallback to context variable
        const ctx = req.context || {};
        if (varName in state && state[varName] !== undefined && state[varName] !== null) {
          replacementValue = typeof state[varName] === 'string'
            ? state[varName]
            : (typeof state[varName] === 'object' && state[varName] !== null
                ? JSON.stringify(state[varName])
                : String(state[varName]));
        } else if (varName in ctx && ctx[varName] !== undefined && ctx[varName] !== null) {
          replacementValue = typeof ctx[varName] === 'string' ? ctx[varName] : JSON.stringify(ctx[varName]);
        } else if (varName.startsWith('$') || varName.includes('.') || varName.includes('[')) {
          try {
            const evaluated = await this.evaluateExpressionAsync(varName.startsWith('$') ? varName : `$context.${varName}`, req);
            if (evaluated !== undefined && evaluated !== null) {
              replacementValue = typeof evaluated === 'string'
                ? evaluated
                : (typeof evaluated === 'object' ? JSON.stringify(evaluated) : String(evaluated));
            }
          } catch (_) {}
        }
        
        if (replacementValue === undefined && !isOptional) {
          throw new Error(`Template Error: State variable '${varName}' is not defined`);
        }
      }

      if (replacementValue !== undefined) {
        result = result.replace(fullMatch, () => replacementValue!);
      } else if (isOptional) {
        result = result.replace(fullMatch, () => ''); // Replace with empty string if optional and missing
      }
    }
    
    return result;
  }

  private async loadConversationHistory(req: any, includeContents?: string): Promise<LlmMessage[]> {
    if (includeContents === 'none') return [];
    
    const limit = (req.ast as any)?.history_limit ?? (req.context as any)?.historyLimit;
    // Sequential steps are created last-to-first, so request ids do not follow execution order:
    // every Response already written (except this request's own turns) is prior history.
    const pastResponses = await this.prisma.response.findMany({
      where: { conversationId: req.conversationId, requestId: { not: req.id } },
      orderBy: limit && limit > 0 ? [{ createdAt: 'desc' }, { id: 'desc' }] : [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit && limit > 0 ? limit : undefined,
      include: { request: true }
    });
    
    if (limit && limit > 0) {
      pastResponses.reverse();
    }
    
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

    if (ast.output_schema) {
      const schemaStr = JSON.stringify(ast.output_schema, null, 2);
      const schemaPrompt = `\n\nYou must respond with a JSON object conforming strictly to the following schema:\n${schemaStr}`;
      if (instruction) instruction += schemaPrompt;
      else instruction = schemaPrompt;
    }

    const provider = LlmFactory.getProvider(ast.provider, ast.baseUrl);
    const model = ast.model;

    // `tools` is either a fixed list or an expression (e.g. "$state.options") re-evaluated on every agent turn,
    // so the set of choices offered to the model can change with the conversation state.
    let offeredTools: (string | CuratorInlineTool)[] = [];
    if (this.isDynamicExpr(ast.tools)) {
      const resolved = await this.evaluateExpressionAsync(ast.tools, req);
      if (resolved != null && !Array.isArray(resolved)) throw new Error(`Agent '${ast.agentName}': tools expression must evaluate to an array`);
      offeredTools = resolved ?? [];
    } else if (Array.isArray(ast.tools)) {
      offeredTools = ast.tools;
    }
    const hasTools = offeredTools.length > 0;

    logger.debug(`[CuratorRequestProcessor] Executing Agent '${ast.agentName}' for request ${req.id} using provider '${provider.providerName}' [mode: ${hasTools ? 'agentic' : 'direct'}]`);

    // Build tool definitions if tools specified
    const toolDefs: LlmToolDefinition[] = [];
    if (hasTools) {
      for (const toolOrName of offeredTools) {
        const tool = typeof toolOrName === 'string' ? this.engine.tools.get(toolOrName) : null;
        if (tool) {
          // Never offer a tool the actor may not run (role / project); the call-time check stays as the backstop.
          if (!(await this.checkToolRoleAccess(req, tool.name, tool)).allowed) continue;
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
    let history: readonly LlmMessage[];
    if (ast.history_from === 'conversation' && ast.include_contents !== 'none') {
      const viewer = String(ast.agentName ?? req.agentId ?? 'agent');
      const built = await buildContext(this.prisma, req.conversationId, viewer, {
        eventNames: ast.history_events ?? [],
        excludeRequestId: req.id,
      });
      const limit = (ast as any).history_limit;
      history = limit > 0 ? built.messages.slice(-limit) : built.messages;
    } else {
      history = await this.loadConversationHistory(req, ast.include_contents);
    }
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
      logger.debug(`[CuratorRequestProcessor] Agent '${ast.agentName}' invoked ${response.toolCalls.length} tool(s) in turn ${iterations}.`);
      
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
        // Only tools offered to this agent may run, even if others are registered in the engine.
        const tool = toolDefs.some((d) => d.name === tc.name) ? this.engine.tools.get(tc.name) : undefined;
        let toolOutput = '';
        let isError = false;

        if (tool) {
          // Check tool access & permission
          const accessCheck = await this.checkToolAccess(req, tc.name, tool);
          if (!accessCheck.allowed) {
            if (accessCheck.requiresConfirmation) {
              logger.debug(`[CuratorRequestProcessor] Request ${req.id} pausing on WAITING_FOR_USER for tool '${tc.name}'.`);
              const ttlMs = (tool as any).approvalTtlMs ?? this.approvalTtlMs;
              const expiresAt = ttlMs > 0 ? new Date(this.clock() + ttlMs).toISOString() : undefined;
              await this.prisma.request.update({
                where: { id: req.id },
                data: {
                  status: 'WAITING_FOR_USER',
                  lockedBy: null,
                  lockedAt: null,
                  context: {
                    ...req.context,
                    pendingToolCall: { ...tc, expiresAt, onExpired: 'fail' },
                    reason: accessCheck.reason
                  }
                }
              });
              await this.saveResponse(req, JSON.stringify({
                type: 'APPROVAL_REQUIRED', ok: false, tool: tc.name, reason: accessCheck.reason, expiresAt
              } satisfies CuratorStructuredResponse));
              pausedForUser = true;
              break;
            } else {
              toolOutput = `[Access Denied] ${accessCheck.reason}`;
              isError = true;
            }
          } else {
            let hydratedSecrets = new Map<string, string>();
            let executionArgs = tc.args;
            let secretResolutionError = false;

            try {
              const hydration = await SecretService.hydrate(tc.args, {
                projectId: req.projectId,
                userId: req.userId,
                agentId: req.agentId,
                prisma: this.prisma
              });
              executionArgs = hydration.hydrated;
              hydratedSecrets = hydration.secretsMap;
            } catch (secErr: any) {
              toolOutput = `[Secret Resolution Error] ${secErr.message}`;
              isError = true;
              secretResolutionError = true;
            }

            if (!secretResolutionError) {
              try {
                const res = await tool.runAsync({
                  args: executionArgs,
                  toolContext: {
                    conversationId: req.conversationId,
                    userId: req.userId,
                    projectId: req.projectId,
                    prisma: this.prisma
                  }
                });
                toolOutput = typeof res === 'string' ? res : JSON.stringify(res);

                // Egress sanitization: mask any reflected secrets before sending back to LLM/DB
                toolOutput = SecretService.mask(toolOutput, hydratedSecrets);

                // Consume ONETIME approval if used
                if (accessCheck.approvalScope === 'ONETIME' && req.context) {
                  delete req.context.__humanApproved__;
                  if (Array.isArray(req.context.__approvedTools__)) {
                    req.context.__approvedTools__ = req.context.__approvedTools__.filter((t: string) => t !== tc.name);
                  }
                }
                // TODO(db-driven): LLM tool calls should become child Requests; until then the agent's
                // conversation history is the record of this call.
              } catch (err: any) {
                toolOutput = `[Tool Error] ${SecretService.mask(err.message, hydratedSecrets)}`;
                isError = true;
              }
            }
          }
        } else {
          // Inline tool check
          const inlineDef = offeredTools.find((t: any) => typeof t !== 'string' && t.name === tc.name) as any;
          if (inlineDef) {
            let hydratedSecrets = new Map<string, string>();
            let executionArgs = tc.args;
            try {
              const hydration = await SecretService.hydrate(tc.args, {
                projectId: req.projectId,
                userId: req.userId,
                agentId: req.agentId,
                prisma: this.prisma
              });
              executionArgs = hydration.hydrated;
              hydratedSecrets = hydration.secretsMap;

              const sandbox = { console, args: executionArgs, fetch };
              const ctx = vm.createContext(sandbox);
              const wrapper = `(async () => { const fn = ${inlineDef.sourceCode}; return await fn(args); })()`;
              const res = await vm.runInContext(wrapper, ctx);
              toolOutput = typeof res === 'string' ? res : JSON.stringify(res);
              toolOutput = SecretService.mask(toolOutput, hydratedSecrets);
            } catch (err: any) {
              toolOutput = `[Inline Tool Error] ${SecretService.mask(err.message, hydratedSecrets)}`;
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

    logger.debug(`[CuratorRequestProcessor] Agent '${ast.agentName}' completed in ${iterations} turn(s). Output length: ${finalOutput.length}`);
    const targetKey = ast.as || (ast.agentName ? ast.agentName.charAt(0).toLowerCase() + ast.agentName.slice(1) : 'decision');
    try {
      const parsed = JSON.parse(finalOutput);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        req.context = { ...(req.context || {}), [targetKey]: parsed };
      } else {
        req.context = { ...(req.context || {}), [targetKey]: finalOutput };
      }
    } catch (_) {
      req.context = { ...(req.context || {}), [targetKey]: finalOutput };
    }
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

  private static readonly STRUCTURED_RECORD_TYPES = new Set([
    'TOOL_BLOCKED', 'APPROVAL_REQUIRED', 'APPROVAL_EXPIRED', 'HUMAN_TIMEOUT', 'WAIT_TIMEOUT', 'EVENT_EMITTED', 'CHOICE_PROMPT', 'CHOICE_RECEIVED',
    'SUBSCRIBED', 'UNSUBSCRIBED', 'MODEL_CHANGED'
  ]);

  /** True for CuratorStructuredResponse audit records (not tool/workflow output). */
  private static isStructuredRecord(value: any): boolean {
    return typeof value?.type === 'string' && CuratorRequestProcessor.STRUCTURED_RECORD_TYPES.has(value.type) && 'ok' in value;
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
              if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) && CuratorRequestProcessor.isStructuredRecord(parsed)) {
                // Structured audit records (EVENT_EMITTED, CALL_STARTED, ...) are not workflow data.
                newUpdates = {};
              } else if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
                if (req.ast?.type === 'Curator_Agent') {
                  const targetKey = req.ast.as || (req.ast.agentName ? req.ast.agentName.charAt(0).toLowerCase() + req.ast.agentName.slice(1) : 'decision');
                  newUpdates = { [targetKey]: parsed };
                } else {
                  newUpdates = parsed;
                }
              } else {
                if (req.ast?.type === 'Curator_Agent') {
                  const targetKey = req.ast.as || (req.ast.agentName ? req.ast.agentName.charAt(0).toLowerCase() + req.ast.agentName.slice(1) : 'decision');
                  newUpdates = { [targetKey]: lastContent };
                } else {
                  newUpdates = { output: lastContent };
                }
              }
            } catch (e) {
              if (req.ast?.type === 'Curator_Agent') {
                const targetKey = req.ast.as || (req.ast.agentName ? req.ast.agentName.charAt(0).toLowerCase() + req.ast.agentName.slice(1) : 'decision');
                newUpdates = { [targetKey]: lastContent };
              } else {
                newUpdates = { output: lastContent };
              }
            }
          }

          const sourceScope = this.parseContext(req.context).__scope;
          const targetIsJoin = (targetReq.ast as any)?.type === 'Curator_Join';
          await this.writeState(targetReq.conversationId, sourceScope, newUpdates);
          const afterConv = await this.prisma.conversation.findUnique({ where: { id: targetReq.conversationId } });
          // A private flow's output stays in its scope; its Join sees only shared state.
          const mergedState = this.stateView(this.getConversationState(afterConv), targetIsJoin ? null : sourceScope);

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
            'spawnedChild', 'routeDecided', 'pendingToolCall', 'waitEvent', 'payloadAlias', 'astPath',
            '__humanInputReceived__', '__joinScope', 'waitDeadline',
            'loopIteration', 'loopRunning', 'loopCollection', 'iteration', 'index']);
          // A parked Curator_Call caller is isolated from its callee: the result flows back only via `as`.
          if (!targetContext.callPending && !(targetIsJoin && sourceScope != null)) {
            for (const [k, v] of Object.entries(sourceContext)) {
              if (!skipKeys.has(k)) targetContext[k] = v;
            }
          }
          // A scope follows its own chain only; the continuation after a Join gets the scope of the parallel's parent.
          if (targetIsJoin) {
            if (targetContext.__joinScope != null) targetContext.__scope = targetContext.__joinScope;
            else delete targetContext.__scope;
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
    const scope = req.context.__scope;
    const convState = this.stateView(
      scope == null && typeof req.context.state === 'object' && req.context.state !== null
        ? req.context.state
        : this.getConversationState(conv),
      scope
    );
    req.context.state = convState;

    // Strip {{...}} mustache wrappers — the VM just needs the raw JS expression
    let cleanExpr = (expr || '').trim();
    if (cleanExpr.startsWith('{{') && cleanExpr.endsWith('}}')) {
      cleanExpr = cleanExpr.slice(2, -2).trim();
    }

    // Normalize natural CoffeeScript boolean operators into valid JS expressions
    cleanExpr = cleanExpr
      .replace(/\bnot\s+/g, '!')
      .replace(/\s+and\s+/g, ' && ')
      .replace(/\s+or\s+/g, ' || ');

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
    // Ensure safeSandbox.context transparently delegates property accesses to convState
    // so both context variables (tool returns) and state variables (setState) are accessible on ctx.
    const mergedContext = new Proxy(req.context, {
      get(target, prop) {
        if (prop in target) return target[prop];
        if (typeof prop === 'string' && prop in convState) return convState[prop];
        return undefined;
      },
      has(target, prop) {
        return prop in target || (typeof prop === 'string' && prop in convState);
      }
    });

    // Always ensure these are present
    safeSandbox.state = convState;
    safeSandbox.input = req.context.input;
    safeSandbox.context = mergedContext;
    safeSandbox.$context = mergedContext;
    safeSandbox.$state = convState;
    safeSandbox.$params = req.context.params ?? {};

    const vmContext = vm.createContext(safeSandbox);
    try {
      return vm.runInContext(cleanExpr, vmContext);
    } catch (e) {
      logger.error(`[CuratorRequestProcessor] Expression evaluation failed for: ${cleanExpr}`, e);
      return false;
    }
  }

  private async handleAssign(ast: any, req: any) {
    logger.debug(`[CuratorRequestProcessor] Handling Assign node for ${req.id}`);
    const evaluatedValue = await this.evaluateExpressionAsync(ast.expression, req);
    
    const updateObj: Record<string, any> = {};
    updateObj[ast.key] = evaluatedValue;
    
    const scope = this.parseContext(req.context).__scope;
    await this.writeState(req.conversationId, scope, updateObj);
    const conv = await this.prisma.conversation.findUnique({ where: { id: req.conversationId } });
    const newState = this.stateView(this.getConversationState(conv), scope);
    
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
    logger.debug(`[CuratorRequestProcessor] Handling IfElse node for ${req.id}`);
    
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
    logger.debug(`[CuratorRequestProcessor] Handling While node for ${req.id}`);
    
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

  /**
   * Curator_Loop: runs `agent` once per iteration (`$context.iteration`, 1-based).
   * Stop conditions: `while` (checked before each iteration), `over` (iterate a collection, item bound to `as`),
   * `until` (checked after each iteration) and `maxIterations`.
   * With `schedule` it is the scheduler subtype: each iteration is queued for the next due time
   * (the loop then runs until cancelled unless bounded).
   */
  private async handleLoop(ast: CuratorLoopNode, req: any) {
    const ctx = req.context || {};
    const running = !!ctx.loopRunning;
    const completed: number = running ? (ctx.loopIteration ?? 0) : 0;

    if (ast.schedule && !isValidSchedule(ast.schedule)) {
      return this.failRequest(req, `Loop schedule '${ast.schedule}' is not a valid cron or interval expression`);
    }

    const conv = await this.prisma.conversation.findUnique({ where: { id: req.conversationId } });
    req.context = { ...ctx, state: this.getConversationState(conv), iteration: completed };

    let collection: any[] | undefined = ctx.loopCollection;
    if (ast.over && !running) {
      collection = await this.evaluateExpressionAsync(ast.over, req);
      if (!Array.isArray(collection)) return this.failRequest(req, `Loop 'over' expression did not evaluate to an array`);
    }

    const limit = ast.maxIterations ?? (ast.schedule ? Infinity : AST_LIMITS.maxLoopIterations);
    let stop: string | null = null;
    if (running && completed >= limit) stop = 'maxIterations';
    else if (running && ast.until && await this.evaluateExpressionAsync(ast.until, req)) stop = 'until';
    else if (collection && completed >= collection.length) stop = 'over';
    else if (ast.while && !(await this.evaluateExpressionAsync(ast.while, req))) stop = 'while';
    if (stop) {
      await this.saveResponse(req, `Loop finished after ${completed} iteration(s) (${stop}).`);
      await this.completeRequest(req.id, 'COMPLETED');
      return;
    }

    const iteration = completed + 1;
    const { loopIteration, loopRunning, loopCollection, ...inherited } = ctx;
    const itemContext = collection ? { [ast.as || 'item']: collection[completed], index: completed } : {};
    const body: any = ast.prompt && !(ast.agent as any).prompt ? { ...ast.agent, prompt: ast.prompt } : ast.agent;
    const runNow = !ast.schedule || (ast.immediate && iteration === 1);
    await this.createValidatedRequest({
      data: {
        ast: body,
        context: { ...inherited, ...itemContext, iteration },
        projectId: req.projectId,
        agentId: req.agentId,
        scriptId: req.scriptId,
        conversationId: req.conversationId,
        userId: req.userId || 1,
        status: 'NEW',
        pendingDependencies: 0,
        notifyId: req.id,
        scheduledAt: runNow ? null : computeNextRunDate(ast.schedule!, new Date(this.clock()))
      }
    });
    await this.prisma.request.update({
      where: { id: req.id },
      data: {
        status: 'WAITING',
        lockedBy: null,
        lockedAt: null,
        pendingDependencies: 1,
        context: { ...ctx, loopIteration: iteration, loopRunning: true, ...(collection ? { loopCollection: collection } : {}) }
      }
    });
  }

  private async handleForEach(ast: any, req: any) {
    logger.debug(`[CuratorRequestProcessor] Handling ForEach node for ${req.id}`);
    
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

/** Calculates the next upcoming Date matching the schedule (cron or interval) starting from fromDate.
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
