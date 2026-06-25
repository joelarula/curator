import * as vm from 'node:vm';
import AjvModule from 'ajv';
const Ajv = (AjvModule as any).default || AjvModule;
import { GoogleGenAI } from '@google/genai';
import { toolRegistry } from '../tools/index.js';
import { curatorEngine } from './CuratorEngine.js';
import { curatorContext } from './CuratorContext.js';

import type { CuratorAstNode, CuratorAgentNode, CuratorSequentialNode, CuratorParallelNode, CuratorJoinNode, CuratorToolNode, CuratorScriptNode, CuratorRouteNode, CuratorGraphNode } from './CuratorAst.js';
import { logger } from '../utils/logger.js';

// Map GOOGLE_API_KEY for @google/genai if needed
if (!process.env.GOOGLE_API_KEY && process.env.GEMINI_API_KEY) {
  process.env.GOOGLE_API_KEY = process.env.GEMINI_API_KEY;
}

export class CuratorRequestProcessor {
  private prisma: any;
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private workerId = `curator-worker-${Math.random().toString(36).substring(7)}`;

  constructor(prisma: any) {
    this.prisma = prisma;
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
      logger.info(`[CuratorRequestProcessor] Syncing tools from CuratorEngine registry...`);
      let count = 0;
      for (const [name, tool] of curatorEngine.tools.entries()) {
        logger.info(`[CuratorRequestProcessor] Upserting tool ${name}...`);
        await this.prisma.tool.upsert({
          where: { name },
          update: { description: (tool as any).description, parametersSchema: (tool as any).parameters, sourceCode: '' },
          create: { name, description: (tool as any).description, parametersSchema: (tool as any).parameters, sourceCode: '' }
        });
        count++;
      }
      logger.info(`[CuratorRequestProcessor] Synced ${count} tools.`);
    } catch (err) {
      logger.error('[CuratorRequestProcessor] Failed to sync tools to DB:', err);
    }
  }

  private async syncAgentsToDb() {
    try {
      logger.info(`[CuratorRequestProcessor] Syncing agents from CuratorEngine registry...`);
      let count = 0;
      for (const [name, agentDef] of curatorEngine.agents.entries()) {
        logger.info(`[CuratorRequestProcessor] Upserting agent ${name}...`);

        // Ensure system user and project exist
        const user = await this.prisma.user.upsert({
          where: { id: 1 },
          update: {},
          create: { id: 1, username: 'system', name: 'System', email: 'system@local' }
        });

        const project = await this.prisma.project.upsert({
          where: { id: 1 },
          update: {},
          create: { id: 1, name: 'System Project', userId: user.id }
        });

        const agent = await this.prisma.agent.upsert({
          where: { name },
          update: { description: (agentDef as any).description || '', userId: user.id, projectId: project.id },
          create: { name, description: (agentDef as any).description || '', userId: user.id, projectId: project.id }
        });

        await this.prisma.agentWorkflow.upsert({
          where: { name },
          update: { description: 'Default workflow', ast: agentDef, agentId: agent.id },
          create: { name, description: 'Default workflow', ast: agentDef, agentId: agent.id }
        });
        count++;
      }
      logger.info(`[CuratorRequestProcessor] Synced ${count} agents.`);
    } catch (err) {
      logger.error('[CuratorRequestProcessor] Failed to sync agents to DB:', err);
    }
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info(`[CuratorRequestProcessor] Worker ${this.workerId} stopped.`);
    }
  }

  private async pollRequests() {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      let hasMore = true;
      while (hasMore) {
        // 1. Wake up requests that were WAITING_FOR_USER and just received a response
        const userRespondedRequests = await this.prisma.request.findMany({
          where: {
            status: 'WAITING_FOR_USER',
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

        // 2. Poll for NEW requests
        const requests = await this.prisma.request.findMany({
          where: {
            status: 'NEW',
            pendingDependencies: 0,
            OR: [
              { scheduledAt: null },
              { scheduledAt: { lte: new Date() } }
            ]
          },
          orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
          take: 5
        });

        if (!requests || requests.length === 0) { hasMore = false; break; }

        const lockedRequests = [];
        for (const req of requests) {
          const updated = await this.prisma.request.updateMany({
            where: { id: req.id, status: 'NEW', pendingDependencies: 0 },
            data: { status: 'WAITING', lockedBy: this.workerId, lockedAt: new Date() }
          });
          if (updated.count > 0) lockedRequests.push(req);
        }

        if (!lockedRequests || lockedRequests.length === 0) { hasMore = false; break; }

        await Promise.all(lockedRequests.map((req: any) => this.processRequest(req)));
      }
    } catch (error) {
      logger.error('[CuratorRequestProcessor] Error polling requests:', error);
    } finally {
      this.isRunning = false;
    }
  }

  private async processRequest(request: any) {
    logger.info(`[CuratorRequestProcessor] Processing request ${request.id}`);
    try {
      const req = await this.prisma.request.findUnique({
        where: { id: request.id },
        include: { user: true }
      });
      if (!req) throw new Error(`Request ${request.id} not found`);

      const ast: CuratorAstNode = req.ast as CuratorAstNode;

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

        const nodeTypes = ['Curator_Agent', 'Curator_Sequential', 'Curator_Parallel', 'Curator_Join', 'Curator_Tool', 'Curator_Script', 'Curator_Route', 'Curator_HumanInput', 'Curator_Graph', 'Curator_AgentRef', 'Curator_SetState', 'Curator_Interrupt', 'Curator_EmitEvent', 'Curator_Assign', 'Curator_IfElse', 'Curator_While', 'Curator_ForEach'];
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
        await this.prisma.response.create({
          data: { requestId: request.id, conversationId: request.conversationId, userId: request.userId, content: `ERROR: ${msg}` }
        });
      } catch (dbErr) {
        logger.error(`[CuratorRequestProcessor] Failed to write error response:`, dbErr);
      }
      await this.prisma.request.update({ where: { id: request.id }, data: { status: 'FAILED', lockedBy: null, lockedAt: null } });
    }
  }

  private async handleEmitEvent(node: any, req: any) {
    logger.info(`[CuratorRequestProcessor] Emitting event: ${node.eventName}`);
    const payload = node.payload ?? req.context?.input;

    const subscriptions = await this.prisma.eventSubscription.findMany({
      where: { eventName: node.eventName, isActive: true },
      include: { agentWorkflow: true }
    });

    let spawnedCount = 0;
    for (const sub of subscriptions) {
      if (node.targetAgentId && sub.agentWorkflow?.agentId !== node.targetAgentId) {
        continue;
      }

      const targetAst = sub.workflowAst || sub.agentWorkflow?.ast;
      if (!targetAst) continue;

      await this.prisma.request.create({
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

    await this.saveResponse(req, `Emitted event '${node.eventName}' to ${spawnedCount} listeners.`);
    await this.completeRequest(req.id, 'COMPLETED');
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

      const newReq = await this.prisma.request.create({
        data: {
          userId: req.userId,
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

    const joinReq = await this.prisma.request.create({
      data: {
        userId: req.userId,
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
      await this.prisma.request.create({
        data: { userId: req.userId, conversationId: req.conversationId, status: 'NEW', pendingDependencies: 0, notifyId: joinReq.id, ast: nodeAst, priority: nodeAst.priority ?? 0, scheduledAt: this.resolveScheduledAt(nodeAst) ?? null }
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

      await this.prisma.request.create({
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
          await this.prisma.request.create({
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

      await this.prisma.request.create({
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
    await this.prisma.request.create({
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

    logger.info(`[CuratorRequestProcessor] Executing Script Node for request ${req.id}`);
    const sandbox = { console, input: req.context?.input || '' };
    const context = vm.createContext(sandbox);
    try {
      const output = vm.runInContext(ast.code, context);
      
      const nodeTypes = ['Curator_Agent', 'Curator_Sequential', 'Curator_Parallel', 'Curator_Join', 'Curator_Tool', 'Curator_Script', 'Curator_Route', 'Curator_HumanInput', 'Curator_Graph', 'Curator_AgentRef', 'Curator_SetState'];
      if (output && typeof output === 'object' && output.type && nodeTypes.includes(output.type)) {
        logger.info(`[CuratorRequestProcessor] Script generated a valid AST node of type ${output.type}. Spawning as child...`);
        // Spawn the dynamic AST
        await this.prisma.request.create({
          data: {
            ast: output,
            context: { ...req.context, spawnedChild: false, input: req.context?.input },
            projectId: req.projectId,
            conversationId: req.conversationId,
            userId: req.userId || 1,
            status: 'PENDING',
            notifyId: req.id
          }
        });

        // Set parent to WAITING
        await this.prisma.request.update({
          where: { id: req.id },
          data: { status: 'WAITING', lockedBy: null, lockedAt: null }
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

  private async handleTool(ast: CuratorToolNode, req: any) {
    logger.info(`[CuratorRequestProcessor] Executing Tool '${ast.toolName}' for request ${req.id}`);
    const tool = toolRegistry[ast.toolName];
    if (!tool) throw new Error(`Tool ${ast.toolName} not found in TypeScript registry.`);

    let result = '';
    try {
      const toolArgs = ast.parameters || ast.args || { url: req.context?.input || '' };
      const output = await tool.runAsync({ args: toolArgs, toolContext: { conversationId: req.conversationId, userId: req.userId, projectId: req.projectId, prisma: this.prisma } });
      result = typeof output === 'string' ? output : JSON.stringify(output);
    } catch(e: any) {
      result = `[Tool Error] ${e.message}`;
    }
    await this.saveResponse(req, result);
    await this.completeRequest(req.id, 'COMPLETED');
  }

  private async handleSetState(ast: any, req: any) {
    logger.info(`[CuratorRequestProcessor] Setting state for request ${req.id}`);
    if (ast.state && typeof ast.state === 'object') {
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: req.conversationId }
      });
      const currentState = (conversation?.state as Record<string, any>) || {};
      const newState = { ...currentState, ...ast.state };
      await this.prisma.conversation.update({
        where: { id: req.conversationId },
        data: { state: newState }
      });
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
        await this.prisma.request.create({
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
        const resumeReq = await this.prisma.request.create({
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

      await this.prisma.request.create({
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
    
    const state = (conversation?.state as Record<string, any>) || {};
    
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

  private async loadConversationHistory(req: any, includeContents?: string): Promise<{role: string, content: string}[]> {
    if (includeContents === 'none') return [];
    
    const pastResponses = await this.prisma.response.findMany({
      where: { conversationId: req.conversationId, requestId: { lt: req.id } },
      orderBy: { createdAt: 'asc' },
      include: { request: true }
    });
    
    if (pastResponses.length === 0) return [];

    let currentRole = '';
    let currentContent = '';
    const messages: {role: string, content: string}[] = [];

    for (const pr of pastResponses) {
      const prAst = pr.request?.ast as any;
      if (prAst?.exclude_from_history) continue;

      if (prAst?.type === 'Curator_Agent') {
         const prompt = await this.interpolateTemplate(prAst.prompt, pr.request) || '';
         if (prompt) messages.push({ role: 'user', content: prompt });
         messages.push({ role: 'model', content: pr.content });
      } else if (prAst?.type === 'Curator_HumanInput') {
         messages.push({ role: 'user', content: pr.content });
      } else if (prAst?.type === 'Curator_Script' || prAst?.type === 'Curator_Tool') {
         // Maybe these should be internal by default? Or we treat them as tool outputs if needed.
         // For now, let's treat them as user context if they are explicitly kept.
         messages.push({ role: 'user', content: pr.content });
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
          // If it's supposed to be an object per schema but is a string, and isn't JSON, it might fail validation naturally
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

    logger.info(`[CuratorRequestProcessor] Executing Agent '${ast.agentName}' for request ${req.id} [mode: ${hasTools ? 'agentic' : 'direct'}]`);

    const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
    const model = ast.model || 'gemini-2.5-flash';

    // Route to local OpenAI-compatible provider (llama.cpp, Ollama, etc.)
    if (ast.provider === 'local' || ast.baseUrl) {
      return this.executeLocalLlm(ast, req, prompt);
    }

    if (!hasTools) {
      // Direct LLM call — no tool-calling loop needed
      const config: any = {};
      if (instruction) config.systemInstruction = instruction;
      if (ast.output_schema && ast.provider !== ('local' as any)) {
        config.responseMimeType = "application/json";
      }

      const history = await this.loadConversationHistory(req, ast.include_contents);
      const rawMessages = history.map(h => ({ role: h.role, text: h.content }));
      rawMessages.push({ role: 'user', text: prompt });
      
      let consolidated: any[] = [];
      for (const m of rawMessages) {
        const last = consolidated[consolidated.length - 1];
        if (last && last.role === m.role) {
           last.parts[0].text += '\n\n' + m.text;
        } else {
           consolidated.push({ role: m.role, parts: [{ text: m.text }] });
        }
      }
      
      if (consolidated.length > 0 && consolidated[0].role === 'model') {
        consolidated.unshift({ role: 'user', parts: [{ text: '[Conversation Started]' }] });
      }

      const result = await ai.models.generateContent({
        model,
        contents: consolidated,
        config
      });

      const text = result.text ?? '';
      logger.info(`[CuratorRequestProcessor] Direct LLM finished. Output length: ${text.length}`);
      await this.saveResponse(req, text);
      await this.completeRequest(req.id, 'COMPLETED');
      return;
    }

    // Agentic tool-calling loop — model decides what tools to call
    const genaiTools = ast.tools!.map((toolOrName: any) => {
      const tool = typeof toolOrName === 'string' ? curatorEngine.tools.get(toolOrName) : null;
      if (!tool && typeof toolOrName === 'string') throw new Error(`Tool ${toolOrName} not found in registry`);

      if (tool) {
        return { functionDeclarations: [tool.toGenAiDeclaration()] };
      } else {
        // Inline tool definition
        return { functionDeclarations: [{ name: toolOrName.name, description: toolOrName.description, parameters: toolOrName.parameters }] };
      }
    });

    const history = await this.loadConversationHistory(req, ast.include_contents);
    const rawMessages = history.map(h => ({ role: h.role, text: h.content }));
    rawMessages.push({ role: 'user', text: prompt });
    
    let consolidated: any[] = [];
    for (const m of rawMessages) {
      const last = consolidated[consolidated.length - 1];
      if (last && last.role === m.role) {
         last.parts[0].text += '\n\n' + m.text;
      } else {
         consolidated.push({ role: m.role, parts: [{ text: m.text }] });
      }
    }
    
    if (consolidated.length > 0 && consolidated[0].role === 'model') {
      consolidated.unshift({ role: 'user', parts: [{ text: '[Conversation Started]' }] });
    }

    const messages: any[] = [...consolidated];

    const config: any = { tools: genaiTools };
    if (instruction) config.systemInstruction = instruction;
    if (ast.output_schema && ast.provider !== ('local' as any)) {
      config.responseMimeType = "application/json";
    }
    let lastText = '';
    let iterations = 0;
    const MAX_ITERATIONS = 10;

    while (iterations < MAX_ITERATIONS) {
      iterations++;
      const result = await ai.models.generateContent({ model, contents: messages, config });
      const calls = result.functionCalls;

      if (!calls || calls.length === 0) {
        lastText = result.text ?? '';
        break;
      }

      // Push model response into history
      messages.push({ role: 'model', parts: result.candidates?.[0]?.content?.parts ?? [] });

      // Execute tools and push results back
      const toolResponses = await Promise.all(calls.map(async (call: any) => {
        const tool = curatorEngine.tools.get(call.name);
        if (tool) {
          const output = await tool.runAsync({ args: call.args, toolContext: { conversationId: req.conversationId, userId: req.userId, projectId: req.projectId, prisma: this.prisma } });
          return { functionResponse: { name: call.name, response: { output: typeof output === 'string' ? output : JSON.stringify(output) } } };
        }
        // Inline tool — execute via VM
        const inlineDef = (ast.tools as any[]).find((t: any) => typeof t !== 'string' && t.name === call.name);
        if (inlineDef) {
          const sandbox = { console, args: call.args, fetch };
          const ctx = vm.createContext(sandbox);
          const wrapper = `(async () => { const fn = ${inlineDef.sourceCode}; return await fn(args); })()`;
          const output = await vm.runInContext(wrapper, ctx);
          return { functionResponse: { name: call.name, response: { output } } };
        }
        return { functionResponse: { name: call.name, response: { error: 'Tool not found' } } };
      }));

      messages.push({ role: 'user', parts: toolResponses });
    }

    logger.info(`[CuratorRequestProcessor] Agentic loop finished after ${iterations} iterations. Output length: ${lastText.length}`);
    await this.saveResponse(req, lastText);
    await this.completeRequest(req.id, 'COMPLETED');
  }

  private async executeLocalLlm(ast: CuratorAgentNode, req: any, prompt: string) {
    const baseUrl = ast.baseUrl || process.env.LOCAL_LLM_URL || 'http://localhost:8080';
    const model = ast.model || 'default'; // llama.cpp ignores model name but some servers use it

    logger.info(`[CuratorRequestProcessor] Calling local LLM at ${baseUrl} model=${model}`);

    const messages: any[] = [];
    if (ast.instruction) {
      messages.push({ role: 'system', content: ast.instruction });
    }

    const history = await this.loadConversationHistory(req, ast.include_contents);
    for (const msg of history) {
      messages.push({ role: msg.role === 'model' ? 'assistant' : msg.role, content: msg.content });
    }

    messages.push({ role: 'user', content: prompt });

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 1024,
        stream: false
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Local LLM error ${response.status}: ${err}`);
    }

    const data = await response.json() as any;
    const text = data.choices?.[0]?.message?.content ?? '';

    logger.info(`[CuratorRequestProcessor] Local LLM finished. Output length: ${text.length}`);
    await this.saveResponse(req, text);
    await this.completeRequest(req.id, 'COMPLETED');
  }

  private async saveResponse(req: any, content: string) {
    await this.prisma.response.create({
      data: {
        requestId: req.id,
        conversationId: req.conversationId,
        userId: req.userId,
        content,
      }
    });
  }

  private async completeRequest(requestId: number, status: string = 'COMPLETED', skipNotify: boolean = false) {
    const req = await this.prisma.request.update({
      where: { id: requestId },
      data: { status, lockedBy: null, lockedAt: null }
    });

    if (req.notifyId && !skipNotify) {
      const responses = await this.prisma.response.findMany({ where: { requestId }, orderBy: { createdAt: 'desc' }, take: 1 });
      const lastContent = responses[0]?.content;

      const targetReq = await this.prisma.request.findUnique({ where: { id: req.notifyId } });
      if (targetReq) {
        let updatedData: any = {
          pendingDependencies: Math.max(0, targetReq.pendingDependencies - 1)
        };
        
        // --- CONVERSATION STATE MERGING ---
        // Fetch the global conversation state
        const conv = await this.prisma.conversation.findUnique({
          where: { id: targetReq.conversationId }
        });
        
        let currentConvState = (conv?.state as any) || {};
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
          
          // Deep merge the updates
          const mergedState = { ...currentConvState, ...newUpdates };
          
          // Save the merged state back to the conversation
          await this.prisma.conversation.update({
            where: { id: targetReq.conversationId },
            data: { state: mergedState }
          });
          
          // Also store it on the targetReq's context so it can trigger its own wake-up logic
          const targetContext = targetReq.context as any || {};
          // Pass the entire state object as a string so the node can consume the full context
          targetContext.input = JSON.stringify(mergedState);
          updatedData.context = targetContext;
        }

        await this.prisma.request.update({
          where: { id: req.notifyId },
          data: updatedData
        });
      }
    }
  }

  private async evaluateExpressionAsync(expr: string, req: any): Promise<any> {
    const conv = await this.prisma.conversation.findUnique({ where: { id: req.conversationId } });
    req.context = req.context || {};
    req.context.state = conv?.state || {};

    const sandbox = { 
      state: req.context.state, 
      input: req.context.input,
      context: req.context
    };
    logger.info(`[CuratorRequestProcessor] VM Sandbox context: ${JSON.stringify(sandbox)}`);
    const context = vm.createContext(sandbox);
    try {
      return vm.runInContext(expr, context);
    } catch (e) {
      logger.error(`[CuratorRequestProcessor] Expression evaluation failed for: ${expr}`, e);
      return false;
    }
  }

  private async handleAssign(ast: any, req: any) {
    logger.info(`[CuratorRequestProcessor] Handling Assign node for ${req.id}`);
    const evaluatedValue = await this.evaluateExpressionAsync(ast.expression, req);
    
    const updateObj: Record<string, any> = {};
    updateObj[ast.key] = evaluatedValue;
    
    const conv = await this.prisma.conversation.findUnique({ where: { id: req.conversationId } });
    const newState = { ...(conv?.state as any || {}), ...updateObj };
    await this.prisma.conversation.update({
      where: { id: req.conversationId },
      data: { state: newState }
    });
    
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
      await this.prisma.request.create({
        data: {
          ast: branchToExecute,
          context: req.context,
          projectId: req.projectId,
          conversationId: req.conversationId,
          userId: req.userId || 1,
          status: 'PENDING',
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
    req.context.state = conv?.state || {};

    const conditionResult = await this.evaluateExpressionAsync(ast.condition, req);
    
    if (conditionResult) {
      await this.prisma.request.create({
        data: {
          ast: ast.body,
          context: req.context,
          projectId: req.projectId,
          conversationId: req.conversationId,
          userId: req.userId || 1,
          status: 'PENDING',
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
    
    await this.prisma.request.create({
      data: {
        ast: ast.body,
        context: { ...req.context, [iteratorName]: item },
        projectId: req.projectId,
        conversationId: req.conversationId,
        userId: req.userId || 1,
        status: 'PENDING',
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

