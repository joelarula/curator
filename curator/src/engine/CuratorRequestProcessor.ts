import * as vm from 'node:vm';
import { GoogleGenAI } from '@google/genai';
import { toolRegistry } from '../tools/index.js';
import { curatorEngine } from './CuratorEngine.js';
import { curatorContext } from './CuratorContext.js';

import type { CuratorAstNode, CuratorAgentNode, CuratorSequentialNode, CuratorParallelNode, CuratorJoinNode, CuratorToolNode, CuratorScriptNode } from './CuratorAst.js';

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
    console.log(`[CuratorRequestProcessor] Starting worker ${this.workerId} with ${intervalMs}ms interval...`);
    this.timer = setInterval(() => this.pollRequests(), intervalMs);
    this.pollRequests();
  }

  private async syncToolsToDb() {
    try {
      console.log(`[CuratorRequestProcessor] Syncing tools from CuratorEngine registry...`);
      let count = 0;
      for (const [name, tool] of curatorEngine.tools.entries()) {
        console.log(`[CuratorRequestProcessor] Upserting tool ${name}...`);
        await this.prisma.tool.upsert({
          where: { name },
          update: { description: (tool as any).description, parametersSchema: (tool as any).parameters, sourceCode: '' },
          create: { name, description: (tool as any).description, parametersSchema: (tool as any).parameters, sourceCode: '' }
        });
        count++;
      }
      console.log(`[CuratorRequestProcessor] Synced ${count} tools.`);
    } catch (err) {
      console.error('[CuratorRequestProcessor] Failed to sync tools to DB:', err);
    }
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log(`[CuratorRequestProcessor] Worker ${this.workerId} stopped.`);
    }
  }

  private async pollRequests() {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      let hasMore = true;
      while (hasMore) {
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
      console.error('[CuratorRequestProcessor] Error polling requests:', error);
    } finally {
      this.isRunning = false;
    }
  }

  private async processRequest(request: any) {
    console.log(`[CuratorRequestProcessor] Processing request ${request.id}`);
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

        const nodeTypes = ['Curator_Agent', 'Curator_Sequential', 'Curator_Parallel', 'Curator_Join', 'Curator_Tool', 'Curator_Script'];
        if (nodeTypes.includes(ast.type)) {
          if (ast.type === 'Curator_Agent') await this.executeAgent(ast, req);
          else if (ast.type === 'Curator_Sequential') await this.handleSequential(ast as CuratorSequentialNode, req);
          else if (ast.type === 'Curator_Parallel') await this.handleParallel(ast as CuratorParallelNode, req);
          else if (ast.type === 'Curator_Join') await this.handleJoin(ast as CuratorJoinNode, req);
          else if (ast.type === 'Curator_Tool') await this.handleTool(ast as CuratorToolNode, req);
          else if (ast.type === 'Curator_Script') await this.handleScript(ast as CuratorScriptNode, req);
          else {
            console.warn(`[CuratorRequestProcessor] Node type ${ast.type} not implemented.`);
            await this.completeRequest(req.id, 'COMPLETED');
          }
        } else {
          console.warn(`[CuratorRequestProcessor] Request ${req.id} has unknown AST type: ${(ast as any).type}. Skipping.`);
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
        console.log(`[CuratorRequestProcessor] Rate limit. Rescheduling request ${request.id} in ${Math.round(delayMs/1000)}s (Attempt ${req.retryCount + 1}/${MAX_RETRIES})`);
        await this.prisma.request.update({ where: { id: request.id }, data: { status: 'NEW', lockedBy: null, lockedAt: null, retryCount: req.retryCount + 1, scheduledAt } });
        return;
      }

      console.error(`[CuratorRequestProcessor] Failed request ${request.id}:`, error);
      try {
        await this.prisma.response.create({
          data: { requestId: request.id, conversationId: request.conversationId, userId: request.userId, content: `ERROR: ${msg}` }
        });
      } catch (dbErr) {
        console.error(`[CuratorRequestProcessor] Failed to write error response:`, dbErr);
      }
      await this.prisma.request.update({ where: { id: request.id }, data: { status: 'FAILED', lockedBy: null, lockedAt: null } });
    }
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
          ast: nodeAst
        }
      });
      currentNotifyId = newReq.id;
    }
    await this.completeRequest(req.id, 'COMPLETED');
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
        data: { userId: req.userId, conversationId: req.conversationId, status: 'NEW', pendingDependencies: 0, notifyId: joinReq.id, ast: nodeAst }
      });
    }
    await this.completeRequest(req.id, 'COMPLETED');
  }

  private async handleJoin(ast: CuratorJoinNode, req: any) {
    console.log(`[CuratorRequestProcessor] Executing Join Node for request ${req.id}`);
    const children = await this.prisma.request.findMany({
      where: { notifyId: req.id, status: 'COMPLETED' },
      include: { responses: { orderBy: { createdAt: 'desc' }, take: 1 } }
    });
    const combinedTexts = children.map((c: any) => c.responses[0]?.content || '').join('\n\n---\n\n');
    await this.saveResponse(req, `[Joined Output]\n${combinedTexts}`);
    await this.completeRequest(req.id, 'COMPLETED');
  }

  private async handleScript(ast: CuratorScriptNode, req: any) {
    console.log(`[CuratorRequestProcessor] Executing Script Node for request ${req.id}`);
    const sandbox = { console, input: req.context?.input || '' };
    const context = vm.createContext(sandbox);
    let result = '';
    try {
      const output = vm.runInContext(ast.code, context);
      result = typeof output === 'string' ? output : JSON.stringify(output);
    } catch(e: any) {
      result = `[Script Error] ${e.message}`;
    }
    await this.saveResponse(req, result);
    await this.completeRequest(req.id, 'COMPLETED');
  }

  private async handleTool(ast: CuratorToolNode, req: any) {
    console.log(`[CuratorRequestProcessor] Executing Tool '${ast.toolName}' for request ${req.id}`);
    const tool = toolRegistry[ast.toolName];
    if (!tool) throw new Error(`Tool ${ast.toolName} not found in TypeScript registry.`);

    let result = '';
    try {
      const toolArgs = ast.parameters || ast.args || { url: req.context?.input || '' };
      const output = await tool.runAsync({ args: toolArgs, toolContext: {} });
      result = typeof output === 'string' ? output : JSON.stringify(output);
    } catch(e: any) {
      result = `[Tool Error] ${e.message}`;
    }
    await this.saveResponse(req, result);
    await this.completeRequest(req.id, 'COMPLETED');
  }

  private async executeAgent(ast: CuratorAgentNode, req: any) {
    const prompt = ast.prompt || 'Hello';
    const hasTools = ast.tools && ast.tools.length > 0;

    console.log(`[CuratorRequestProcessor] Executing Agent '${ast.agentName}' for request ${req.id} [mode: ${hasTools ? 'agentic' : 'direct'}]`);

    const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
    const model = ast.model || 'gemini-2.5-flash';

    if (!hasTools) {
      // Direct LLM call — no tool-calling loop needed
      const config: any = {};
      if (ast.instruction) config.systemInstruction = ast.instruction;

      const result = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config
      });

      const text = result.text ?? '';
      console.log(`[CuratorRequestProcessor] Direct LLM finished. Output length: ${text.length}`);
      await this.saveResponse(req, text);
      await this.completeRequest(req.id, 'COMPLETED');
      return;
    }

    // Agentic tool-calling loop — model decides what tools to call
    const genaiTools = ast.tools!.map((toolOrName: any) => {
      const tool = typeof toolOrName === 'string' ? toolRegistry[toolOrName] : null;
      if (!tool && typeof toolOrName === 'string') throw new Error(`Tool ${toolOrName} not found in registry`);

      if (tool) {
        return { functionDeclarations: [tool.toGenAiDeclaration()] };
      } else {
        // Inline tool definition
        return { functionDeclarations: [{ name: toolOrName.name, description: toolOrName.description, parameters: toolOrName.parameters }] };
      }
    });

    const messages: any[] = [];
    if (ast.instruction) {
      messages.push({ role: 'user', parts: [{ text: `[System]: ${ast.instruction}\n\n${prompt}` }] });
    } else {
      messages.push({ role: 'user', parts: [{ text: prompt }] });
    }

    let lastText = '';
    let iterations = 0;
    const MAX_ITERATIONS = 10;

    while (iterations < MAX_ITERATIONS) {
      iterations++;
      const result = await ai.models.generateContent({ model, contents: messages, config: { tools: genaiTools } });
      const calls = result.functionCalls;

      if (!calls || calls.length === 0) {
        lastText = result.text ?? '';
        break;
      }

      // Push model response into history
      messages.push({ role: 'model', parts: result.candidates?.[0]?.content?.parts ?? [] });

      // Execute tools and push results back
      const toolResponses = await Promise.all(calls.map(async (call: any) => {
        const tool = toolRegistry[call.name];
        if (tool) {
          const output = await tool.runAsync({ args: call.args, toolContext: {} });
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

    console.log(`[CuratorRequestProcessor] Agentic loop finished after ${iterations} iterations. Output length: ${lastText.length}`);
    await this.saveResponse(req, lastText);
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

  private async completeRequest(requestId: number, status: string) {
    const req = await this.prisma.request.update({
      where: { id: requestId },
      data: { status }
    });

    if (status === 'COMPLETED' && req.notifyId) {
      const responses = await this.prisma.response.findMany({ where: { requestId }, orderBy: { createdAt: 'desc' }, take: 1 });
      const lastContent = responses[0]?.content;

      const targetReq = await this.prisma.request.findUnique({ where: { id: req.notifyId } });
      if (targetReq) {
        let updatedData: any = { pendingDependencies: { decrement: 1 } };

        if (lastContent) {
          const updatedAst = targetReq.ast as any;
          if (['Curator_Agent', 'Curator_Sequential', 'Curator_Parallel'].includes(updatedAst.type)) {
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

        await this.prisma.request.update({ where: { id: req.notifyId }, data: updatedData });
      }
    }
  }
}
