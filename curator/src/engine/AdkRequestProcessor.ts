import * as vm from 'node:vm';
import { Runner } from '@google/adk';
import { PrismaSessionService } from '../sessions/PrismaSessionService.js';
import { Agent, SequentialAgent, ParallelAgent, FunctionTool } from '@google/adk'; 
import { toolRegistry } from '../tools/index.js';

import type { AdkAstNode, AdkAgentNode, AdkSequentialNode, AdkParallelNode, AdkJoinNode, AdkRouteNode, AdkLoopNode, AdkToolNode, AdkScriptNode } from './AdkAst.js';

export class AdkRequestProcessor {
  private prisma: any; // PrismaClient instance
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private workerId = `adk-worker-${Math.random().toString(36).substring(7)}`;

  constructor(prisma: any) {
    this.prisma = prisma;
  }

  public async start(intervalMs: number = 3000) {
    // Sync local TypeScript tools to DB on startup
    await this.syncToolsToDb();

    console.log(`[AdkRequestProcessor] Starting worker ${this.workerId} with ${intervalMs}ms interval...`);
    this.timer = setInterval(() => this.pollRequests(), intervalMs);
    this.pollRequests();
  }

  private async syncToolsToDb() {
    try {
      console.log(`[AdkRequestProcessor] Importing tool registry...`);
      const { toolRegistry } = await import('../tools/index.js');
      console.log(`[AdkRequestProcessor] Tool registry imported.`);
      let count = 0;
      for (const [name, tool] of Object.entries(toolRegistry)) {
        console.log(`[AdkRequestProcessor] Upserting tool ${name}...`);
        await this.prisma.tool.upsert({
          where: { name },
          update: { description: (tool as any).description, parametersSchema: (tool as any).parameters, sourceCode: '' },
          create: { name, description: (tool as any).description, parametersSchema: (tool as any).parameters, sourceCode: '' }
        });
        count++;
      }
      console.log(`[AdkRequestProcessor] Synced ${count} local tools to database registry.`);
    } catch (err) {
      console.error('[AdkRequestProcessor] Failed to sync local tools to DB:', err);
    }
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log(`[AdkRequestProcessor] Worker ${this.workerId} stopped.`);
    }
  }

  private async pollRequests() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      let hasMore = true;
      while (hasMore) {
        // Find and lock NEW ADK requests atomically using a raw update query 
        const requests = await this.prisma.request.findMany({
          where: {
            status: 'NEW',
            pendingDependencies: 0,
            OR: [
              { scheduledAt: null },
              { scheduledAt: { lte: new Date() } }
            ]
          },
          orderBy: { createdAt: 'asc' },
          take: 5
        });

        if (!requests || requests.length === 0) {
          hasMore = false;
          break;
        }

        const lockedRequests = [];
        for (const req of requests) {
          const updated = await this.prisma.request.updateMany({
            where: { id: req.id, status: 'NEW', pendingDependencies: 0 },
            data: { status: 'WAITING', lockedBy: this.workerId, lockedAt: new Date() }
          });
          if (updated.count > 0) lockedRequests.push(req);
        }

        if (!lockedRequests || lockedRequests.length === 0) {
          hasMore = false;
          break;
        }

        // Process the batch concurrently
        await Promise.all(lockedRequests.map((req: any) => this.processRequest(req)));
      }
    } catch (error) {
      console.error('[AdkRequestProcessor] Error polling requests:', error);
    } finally {
      this.isRunning = false;
    }
  }

  private async processRequest(request: any) {
    console.log(`[AdkRequestProcessor] Processing request ${request.id}`);

    try {
      const req = await this.prisma.request.findUnique({
        where: { id: request.id },
        include: { user: true }
      });

      if (!req) throw new Error(`Request ${request.id} not found`);

      const ast: AdkAstNode = req.ast as AdkAstNode;

      if (!ast) {
         console.log(`[AdkRequestProcessor] No AST found for request ${req.id}. Marking COMPLETED.`);
         await this.completeRequest(request.id, 'COMPLETED');
         return;
      }

      // Accept distributed AST nodes
      if (['ADK_Agent', 'ADK_Sequential', 'ADK_Parallel', 'ADK_Join', 'ADK_Route', 'ADK_Loop', 'ADK_Tool', 'ADK_Script'].includes(ast.type)) {
          if (ast.type === 'ADK_Agent') await this.executeAdkAgent(ast, req);
          else if (ast.type === 'ADK_Sequential') await this.handleSequential(ast as AdkSequentialNode, req);
          else if (ast.type === 'ADK_Parallel') await this.handleParallel(ast as AdkParallelNode, req);
          else if (ast.type === 'ADK_Join') await this.handleJoin(ast as AdkJoinNode, req);
          else if (ast.type === 'ADK_Tool') await this.handleTool(ast as AdkToolNode, req);
          else if (ast.type === 'ADK_Script') await this.handleScript(ast as AdkScriptNode, req);
          else {
             console.warn(`[AdkRequestProcessor] Node type ${ast.type} is not yet implemented in unroller.`);
             await this.completeRequest(req.id, 'COMPLETED');
          }
      } else {
          console.warn(`[AdkRequestProcessor] Request ${req.id} has non-ADK AST type: ${ast.type}. Marking as SKIPPED.`);
          
          await this.prisma.request.update({
             where: { id: req.id },
             data: { status: 'SKIPPED', lockedBy: null, lockedAt: null }
          });
          return;
      }

    } catch (error: any) {
      const msg = error.message || String(error);
      const retryMatch = msg.match(/Please retry in ([\\d\\.]+)s/);
      const isRateLimit = msg.includes('429') || msg.includes('Quota exceeded') || !!retryMatch;
      const MAX_RETRIES = 5;

      const req = await this.prisma.request.findUnique({ where: { id: request.id } });

      if (isRateLimit && req && req.retryCount < MAX_RETRIES) {
          let delayMs = 5000 * Math.pow(2, req.retryCount);
          if (retryMatch) {
              delayMs = parseFloat(retryMatch[1]) * 1000 + 1000;
          }
          const scheduledAt = new Date(Date.now() + delayMs);
          console.log(`[AdkRequestProcessor] Rate limit hit. Rescheduling request ${request.id} for ${Math.round(delayMs/1000)}s from now (Attempt ${req.retryCount + 1}/${MAX_RETRIES})`);
          
          await this.prisma.request.update({
              where: { id: request.id },
              data: {
                  status: 'NEW',
                  lockedBy: null,
                  lockedAt: null,
                  retryCount: req.retryCount + 1,
                  scheduledAt
              }
          });
          return;
      }

      console.error(`[AdkRequestProcessor] Failed request ${request.id}:`, error);

      try {
        await this.prisma.response.create({
          data: {
            requestId: request.id,
            sessionId: request.sessionId,
            appName: request.appName,
            userId: request.userId,
            content: `ERROR: ${msg}`
          }
        });
      } catch (dbErr) {
        console.error(`[AdkRequestProcessor] Failed to write error response for request ${request.id}:`, dbErr);
      }

      await this.prisma.request.update({
        where: { id: request.id },
        data: {
          status: 'FAILED',
          lockedBy: null,
          lockedAt: null
        }
      });
    }
  }

  private async handleSequential(ast: AdkSequentialNode, req: any) {
    const subAgents = ast.subAgents;
    if (!subAgents || subAgents.length === 0) {
      await this.completeRequest(req.id, 'COMPLETED');
      return;
    }

    let currentNotifyId = req.notifyId;
    for (let i = subAgents.length - 1; i >= 0; i--) {
      const isFirst = i === 0;
      let nodeAst = subAgents[i] as any;
      
      // If the root node has a prompt and this is the first subagent, give it the prompt
      if (isFirst && ast.prompt && !nodeAst.prompt) {
          nodeAst.prompt = ast.prompt;
      }

      const newReq = await this.prisma.request.create({
        data: {
          userId: req.userId,
          sessionId: req.sessionId,
          appName: req.appName,
          status: 'NEW',
          pendingDependencies: isFirst ? 0 : 1,
          notifyId: currentNotifyId,
          ast: nodeAst
        }
      });
      currentNotifyId = newReq.id;
    }

    await this.completeRequest(req.id, 'COMPLETED');
  }

  private async handleParallel(ast: AdkParallelNode, req: any) {
    const subAgents = ast.subAgents;
    if (!subAgents || subAgents.length === 0) {
      await this.completeRequest(req.id, 'COMPLETED');
      return;
    }

    const joinReq = await this.prisma.request.create({
      data: {
        userId: req.userId,
        sessionId: req.sessionId,
        appName: req.appName,
        status: 'NEW',
        pendingDependencies: subAgents.length,
        notifyId: req.notifyId,
        ast: { type: 'ADK_Join', name: `${ast.name || 'parallel'}_join` } as any
      }
    });

    for (const sub of subAgents) {
      let nodeAst = sub as any;
      if (ast.prompt && !nodeAst.prompt) nodeAst.prompt = ast.prompt;

      await this.prisma.request.create({
        data: {
          userId: req.userId,
          sessionId: req.sessionId,
          appName: req.appName,
          status: 'NEW',
          pendingDependencies: 0,
          notifyId: joinReq.id,
          ast: nodeAst
        }
      });
    }

    await this.completeRequest(req.id, 'COMPLETED');
  }

  private async handleJoin(ast: AdkJoinNode, req: any) {
    console.log(`[AdkRequestProcessor] Executing Join Node for request ${req.id}`);
    const children = await this.prisma.request.findMany({
      where: { notifyId: req.id, status: 'COMPLETED' },
      include: { responses: { orderBy: { createdAt: 'desc' }, take: 1 } }
    });
    
    const combinedTexts = children.map((c: any) => c.responses[0]?.content || '').join('\n\n---\n\n');

    await this.prisma.response.create({
      data: {
        requestId: req.id,
        sessionId: req.sessionId,
        appName: req.appName,
        userId: req.userId,
        content: `[Joined Output]\n${combinedTexts}`,
      }
    });

    await this.completeRequest(req.id, 'COMPLETED');
  }

  private async handleScript(ast: AdkScriptNode, req: any) {
    console.log(`[AdkRequestProcessor] Executing Script Node for request ${req.id}`);
    const sandbox = {
       console,
       input: req.context?.input || '', 
    };
    
    const context = vm.createContext(sandbox);
    let result = '';
    try {
      const output = vm.runInContext(ast.code, context);
      result = typeof output === 'string' ? output : JSON.stringify(output);
    } catch(e: any) {
      result = `[Script Error] ${e.message}`;
    }

    await this.prisma.response.create({
      data: { requestId: req.id, sessionId: req.sessionId, appName: req.appName, userId: req.userId, content: result }
    });
    await this.completeRequest(req.id, 'COMPLETED');
  }

  private async handleTool(ast: AdkToolNode, req: any) {
    console.log(`[AdkRequestProcessor] Executing pure Tool '${ast.toolName}' for request ${req.id}`);
    const tool = toolRegistry[ast.toolName];
    if (!tool) {
      throw new Error(`Tool ${ast.toolName} not found in TypeScript registry.`);
    }

    let result = '';
    try {
      const output = await tool.runAsync({ args: ast.args || { url: req.context?.input || '' }, toolContext: {} as any });
      result = typeof output === 'string' ? output : JSON.stringify(output);
    } catch(e: any) {
      result = `[Tool Error] ${e.message}`;
    }

    await this.prisma.response.create({
      data: { requestId: req.id, sessionId: req.sessionId, appName: req.appName, userId: req.userId, content: result }
    });
    await this.completeRequest(req.id, 'COMPLETED');
  }

  private async executeAdkAgent(ast: AdkAgentNode, req: any) {
    const prompt = ast.prompt || 'Hello';
    
    console.log(`[AdkRequestProcessor] Executing ADK Agent '${ast.agentName}' for request ${req.id}`);
    
    let adkTools: FunctionTool[] = [];
    if (ast.tools && ast.tools.length > 0) {
       adkTools = ast.tools.map((toolOrName: any) => {
         if (typeof toolOrName === 'string') {
           const tool = toolRegistry[toolOrName];
           if (!tool) throw new Error(`Tool ${toolOrName} not found in registry`);
           return tool;
         } else {
           // Ad-hoc tool definition
           return new FunctionTool({
              name: toolOrName.name,
              description: toolOrName.description,
              parameters: toolOrName.parameters,
              execute: async (args: any) => {
                 const sandbox = { console, args, fetch };
                 const context = vm.createContext(sandbox);
                 const wrapper = `(async () => { const fn = ${toolOrName.sourceCode}; return await fn(args); })()`;
                 return await vm.runInContext(wrapper, context);
              }
           });
         }
       });
    }

    const agent = new Agent({
      name: ast.agentName || 'GenericAgent',
      model: ast.model || 'gemini-1.5-flash',
      instruction: ast.instruction || undefined,
      tools: adkTools.length > 0 ? adkTools : undefined
    });

    const sessionService = new PrismaSessionService(this.prisma);

    const sessionId = req.sessionId;
    const userId = req.userId || 'system';
    const appName = req.appName;

    await sessionService.createSession({
      appName,
      userId,
      sessionId
    });

    const runner = new Runner({
      appName,
      agent,
      sessionService
    });

    const responseGenerator = runner.runAsync({
      userId,
      sessionId,
      newMessage: { parts: [{ text: prompt }] }
    });

    let lastText = '';
    for await (const event of responseGenerator) {
      if (event.errorMessage) {
        throw new Error(`ADK Error [${event.errorCode || 'UNKNOWN'}]: ${event.errorMessage}`);
      }
      
      if (!event.content?.parts || event.author === 'user') continue;

      const parts = event.content.parts as Array<{ text?: string }>;
      const text = parts
        .filter((p) => typeof p.text === 'string' && p.text.trim().length > 0)
        .map((p) => p.text as string)
        .join('');

      if (text) {
        lastText = text;
      }
    }

    console.log(`[AdkRequestProcessor] Agent finished. Final output length: ${lastText.length}`);

    // Write output to Response table
    await this.prisma.response.create({
      data: {
        requestId: req.id,
        sessionId: req.sessionId,
        appName: req.appName,
        userId: req.userId,
        content: lastText,
      }
    });

    await this.completeRequest(req.id, 'COMPLETED');
  }

  private async completeRequest(requestId: number, status: string) {
    const req = await this.prisma.request.update({
      where: { id: requestId },
      data: { status }
    });

    // Handle pipeline data forwarding and dependency resolution
    if (status === 'COMPLETED' && req.notifyId) {
      const responses = await this.prisma.response.findMany({ where: { requestId }, orderBy: { createdAt: 'desc' }, take: 1 });
      const lastContent = responses[0]?.content;
      
      const targetReq = await this.prisma.request.findUnique({ where: { id: req.notifyId } });
      if (targetReq) {
         let updatedData: any = { pendingDependencies: { decrement: 1 } };
         
         if (lastContent) {
           const updatedAst = targetReq.ast as any;
           if (updatedAst.type === 'ADK_Agent' || updatedAst.type === 'ADK_Sequential' || updatedAst.type === 'ADK_Parallel') {
              if (!updatedAst.prompt) {
                 updatedAst.prompt = lastContent;
              } else if (updatedAst.prompt.includes('{{INPUT}}')) {
                 updatedAst.prompt = updatedAst.prompt.replace('{{INPUT}}', lastContent);
              } else {
                 updatedAst.prompt = `${updatedAst.prompt}\n\n${lastContent}`;
              }
              updatedData.ast = updatedAst;
           }
         }
         
         await this.prisma.request.update({
           where: { id: req.notifyId },
           data: updatedData
         });
      }
    }
  }
}
