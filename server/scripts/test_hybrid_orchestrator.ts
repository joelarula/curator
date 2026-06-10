import { Agent, Runner, InMemorySessionService, BasePlugin, Context, BaseTool, FunctionTool } from '@google/adk';
import type { LlmRequest, LlmResponse } from '@google/adk';

import { provisionSqliteDb } from '../src/bin/sqliteProvisioner.js';

// Define the custom observer plugin to intercept ADK events and persist to Curator schema
class CuratorADKPlugin extends BasePlugin {
  private prisma: any;
  private userId: string;
  private projectId: string | null;
  private conversationId: number;

  constructor(prisma: any, userId: string, projectId: string | null, conversationId: number) {
    super('curator_adk_observer');
    this.prisma = prisma;
    this.userId = userId;
    this.projectId = projectId;
    this.conversationId = conversationId;
  }

  override async beforeModelCallback(params: { callbackContext: Context; llmRequest: LlmRequest }): Promise<LlmResponse | undefined> {
    console.log(`[Plugin] beforeModelCallback: Creating ask_llm Request row...`);
    const request = await this.prisma.request.create({
      data: {
        userId: this.userId,
        projectId: this.projectId,
        conversationId: this.conversationId,
        toolName: 'ask_llm',
        status: 'NEW',
        ast: {},
        context: {
          prompt: params.llmRequest.contents ? JSON.parse(JSON.stringify(params.llmRequest.contents)) : null
        }
      }
    });
    params.callbackContext.state.set('curator_last_llm_request_id', request.id);
    return undefined;
  }

  override async afterModelCallback(params: { callbackContext: Context; llmResponse: LlmResponse }): Promise<LlmResponse | undefined> {
    console.log(`[Plugin] afterModelCallback: Saving LLM Response and updating Request status...`);
    const requestId = params.callbackContext.state.get<number>('curator_last_llm_request_id');
    if (requestId) {
      const content = typeof params.llmResponse === 'object' ? JSON.stringify(params.llmResponse) : String(params.llmResponse);
      await this.prisma.response.create({
        data: {
          requestId,
          conversationId: this.conversationId,
          content,
          projectId: this.projectId
        }
      });
      await this.prisma.request.update({
        where: { id: requestId },
        data: { status: 'COMPLETED' }
      });
    }
    return undefined;
  }

  override async beforeToolCallback(params: { tool: BaseTool; toolArgs: Record<string, unknown>; toolContext: Context }): Promise<Record<string, unknown> | undefined> {
    console.log(`[Plugin] beforeToolCallback: Intercepting tool ${params.tool.name} call...`);
    const request = await this.prisma.request.create({
      data: {
        userId: this.userId,
        projectId: this.projectId,
        conversationId: this.conversationId,
        toolName: params.tool.name,
        status: 'NEW',
        ast: {},
        context: {
          args: JSON.parse(JSON.stringify(params.toolArgs))
        }
      }
    });
    params.toolContext.state.set(`curator_tool_request_id_${params.tool.name}`, request.id);
    return undefined;
  }

  override async afterToolCallback(params: { tool: BaseTool; toolArgs: Record<string, unknown>; toolContext: Context; result: Record<string, unknown> }): Promise<Record<string, unknown> | undefined> {
    console.log(`[Plugin] afterToolCallback: Saving result of tool ${params.tool.name}...`);
    const requestId = params.toolContext.state.get<number>(`curator_tool_request_id_${params.tool.name}`);
    if (requestId) {
      await this.prisma.response.create({
        data: {
          requestId,
          conversationId: this.conversationId,
          content: JSON.stringify(params.result),
          projectId: this.projectId
        }
      });
      await this.prisma.request.update({
        where: { id: requestId },
        data: { status: 'COMPLETED' }
      });
    }
    return undefined;
  }
}

async function runTest() {
  console.log("Provisioning SQLite DB...");
  const prisma = await provisionSqliteDb("test_hybrid_orchestrator", false); // false to reuse already seeded db



  // Get user & project
  const user = await prisma.user.findFirst();
  if (!user) throw new Error("User not found");
  const project = await prisma.project.findFirst({ where: { id: 'system' } });
  if (!project) throw new Error("Project not found");

  // Create conversation
  const conversation = await prisma.conversation.create({
    data: {
      userId: user.id,
      projectId: project.id
    }
  });

  // Define a mock local tool
  const mockSearchTool = new FunctionTool({
    name: 'web_search',
    description: 'Search for facts online.',
    execute: async (args: { query: string }) => {
      console.log(`[Tool Executed] web_search query: ${args.query}`);
      return { results: [`Fact: First semiconductor was discovered in 1833 by Michael Faraday.`] };
    },
    inputParameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING' }
      },
      required: ['query']
    }
  });

  // Define the ADK Agent
  const agent = new Agent({
    model: 'gemini-2.5-flash',
    instruction: 'You are a research assistant. Verify facts using the web_search tool before writing.',
    tools: [mockSearchTool]
  });

  // Initialize the ADK Runner with our custom plugin
  const plugin = new CuratorADKPlugin(prisma, user.id, project.id, conversation.id);
  const sessionService = new InMemorySessionService();
  const runner = new Runner({
    appName: 'CuratorHybridApp',
    agent,
    plugins: [plugin],
    sessionService
  });

  const sessionId = `session_${conversation.id}`;
  console.log(`Creating session: ${sessionId}`);
  await sessionService.createSession({
    appName: 'CuratorHybridApp',
    userId: user.id,
    sessionId
  });

  console.log("Starting ADK execution runAsync...");
  const prompt = "Explain who discovered the first semiconductor.";
  
  const responseGenerator = runner.runAsync({
    userId: user.id,
    sessionId,
    newMessage: { parts: [{ text: prompt }] }
  });


  try {
    for await (const event of responseGenerator) {
      console.log(`[Event]`, event.type);
    }
  } catch (err: any) {
    console.error(`[Execution Error]`, err.message);
  }

  // Retrieve all logged Requests and Responses from the SQLite DB
  const requests = await prisma.request.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: 'asc' },
    include: { responses: true }
  });

  console.log("\n=================== DB AUDIT LOGS ===================");
  for (const req of requests) {
    console.log(`\n[Request] Tool: ${req.toolName} (Status: ${req.status})`);
    console.log(`Input Context:`, JSON.stringify(req.context));
    for (const res of req.responses) {
      console.log(`  --> [Response] Content:`, res.content.substring(0, 300));
    }
  }
  console.log("=====================================================");

  await prisma.$disconnect();
}

runTest().catch(console.error);
