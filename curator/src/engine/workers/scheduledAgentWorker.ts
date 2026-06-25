import { parentPort, workerData } from 'worker_threads';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import { pathToFileURL } from 'url';

const prisma = new PrismaClient();

async function run() {
  const scheduledAgentId = workerData.scheduledAgentId;
  if (!scheduledAgentId) {
    throw new Error('No scheduledAgentId provided to worker');
  }

  const agent = await prisma.scheduledAgent.findUnique({
    where: { id: scheduledAgentId }
  });

  if (!agent) {
    throw new Error(`ScheduledAgent ${scheduledAgentId} not found`);
  }

  console.log(`[ScheduledAgentWorker] Executing scheduled agent ${agent.name} (ID: ${agent.id})`);

  let ast: any = null;
  let status = 'NEW';
  let context: any = null;
  let workflowName: string | null = null;
  let errorMsg: string | null = null;

  try {
    if (agent.scriptPath) {
      const { curatorEngine } = await import('../CuratorEngine.js');
      const { curatorContext } = await import('../CuratorContext.js');
      const registeredScript = curatorEngine.scripts.get(agent.scriptPath);

      if (registeredScript && typeof registeredScript.run === 'function') {
        console.log(`[AgentWorker] Executing registered script: ${agent.scriptPath}`);
        
        await curatorContext.run({
          userId: agent.userId,
          projectId: agent.projectId || 1,
          userIds: [agent.userId],
          projectIds: [agent.projectId || 1],
          sessionId: `agent_${agent.id}_session`,
          prisma
        }, async () => {
          const result = await registeredScript.run({ prisma, dbName: 'default.db' });
          if (result && typeof result === 'object' && result.type) {
            ast = result;
          } else {
            throw new Error('Registered script run() did not return a valid AST object');
          }
        });
      } else {
        throw new Error(`Script '${agent.scriptPath}' is not registered in the CuratorEngine whitelist.`);
      }
    } else if (agent.workflowName) {
      workflowName = agent.workflowName;
      ast = {
        type: 'Curator_AgentRef',
        agentName: agent.workflowName
      };
      context = { input: agent.workflowParams || {} };
    } else {
      throw new Error('Agent has neither scriptPath nor workflowName defined');
    }
  } catch (err: any) {
    console.error(`[ScheduledAgentWorker] Execution failed for agent ${agent.name}:`, err);
    status = 'FAILED';
    errorMsg = err.message;
    
    // We still want to log a failed request to the DB to track the error
    ast = ast || { type: 'Error', message: errorMsg };
  }

  // Find or create Conversation for the agent's user
  const conversationId = `agent_${agent.id}_conversation`;
  
  await prisma.conversation.upsert({
    where: { id: conversationId },
    update: {},
    create: { id: conversationId, userId: agent.userId }
  });

  // Create the Request
  const req = await prisma.request.create({
    data: {
      userId: agent.userId,
      projectId: agent.projectId,
      conversationId,
      status: status,
      toolName: workflowName || 'Curator_Workflow',
      ast: ast,
      context: context
    }
  });

  console.log(`[ScheduledAgentWorker] Created Request ${req.id} for agent ${agent.name} with status ${status}`);

  if (parentPort) {
    parentPort.postMessage('done');
  }
}

run()
  .catch(err => {
    console.error('[ScheduledAgentWorker] Fatal worker error:', err);
    if (parentPort) {
      parentPort.postMessage('error');
    }
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
