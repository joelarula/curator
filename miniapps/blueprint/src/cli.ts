#!/usr/bin/env node

import { Command } from 'commander';
import { createBlueprintHost } from './host.js';

const program = new Command();

program
  .name('curator-blueprint-cli')
  .description('Command-line execution & management interface for Curator Blueprint MiniApp');

// 1. Database Seeding
program
  .command('seed')
  .description('Idempotently initialize database and seed tools and agent workflows')
  .action(async () => {
    console.log('[Blueprint CLI] Booting host...');
    const host = await createBlueprintHost();
    console.log('[Blueprint CLI] Seeding tools and agents...');
    const result = await host.seed();
    console.log(JSON.stringify({ status: 'seed_complete', ...result }, null, 2));
    await host.stop();
  });

// 2. Direct Tool Execution (In-Process Synchronous Run)
program
  .command('exec <toolName>')
  .description('Directly execute a registered Curator tool in-process and print output')
  .option('-a, --args <json>', 'JSON arguments passed to the tool', '{}')
  .action(async (toolName, options) => {
    const host = await createBlueprintHost();
    try {
      const tool = host.engine.tools.get(toolName);
      if (!tool) {
        throw new Error(`Tool "${toolName}" not found in registered engine tools. Available: ${[...host.engine.tools.keys()].join(', ')}`);
      }

      const args = JSON.parse(options.args);
      console.log(`[Blueprint CLI] Executing tool "${toolName}" directly...`);

      const user = await host.prisma.user.findFirst({ where: { email: 'system@local' } });
      const project = await host.prisma.project.findFirst({ where: { id: '1' } });

      const output = await tool.runAsync({
        args,
        toolContext: {
          prisma: host.prisma,
          userId: user?.id || '1',
          projectId: project?.id || '1',
        },
      });

      console.log(JSON.stringify({ tool: toolName, status: 'completed', output }, null, 2));
    } catch (err: any) {
      console.error('[Blueprint CLI] Execution error:', err?.message || err);
      process.exitCode = 1;
    } finally {
      await host.stop();
    }
  });

// 3. Synchronous Agent Execution (Runs processor until completion)
program
  .command('run <agentName>')
  .description('Trigger an agent workflow and wait for execution completion in terminal')
  .option('-c, --context <json>', 'JSON input context for agent workflow', '{}')
  .option('-t, --timeout <seconds>', 'Timeout in seconds', '30')
  .action(async (agentName, options) => {
    const host = await createBlueprintHost();
    try {
      const context = JSON.parse(options.context);
      console.log(`[Blueprint CLI] Triggering agent "${agentName}"...`);
      const request = await host.triggerAgent(agentName, context);
      console.log(`[Blueprint CLI] Request #${request.id} queued. Processing in terminal...`);

      // Start processor in background to execute the request
      await host.start(1000);

      const timeoutMs = Number(options.timeout) * 1000;
      const startTime = Date.now();

      // Poll until request completes or fails
      let done = false;
      while (!done) {
        if (Date.now() - startTime > timeoutMs) {
          throw new Error(`Workflow timed out after ${options.timeout}s`);
        }

        const req = await host.prisma.request.findUnique({
          where: { id: request.id },
          include: { responses: { orderBy: { createdAt: 'desc' } } },
        });

        if (req && ['COMPLETED', 'FAILED', 'CANCELLED', 'SKIPPED'].includes(req.status)) {
          done = true;
          console.log(
            JSON.stringify(
              {
                requestId: req.id,
                agent: agentName,
                status: req.status,
                responses: req.responses.map((r: any) => r.content),
              },
              null,
              2
            )
          );
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch (err: any) {
      console.error('[Blueprint CLI] Agent run error:', err?.message || err);
      process.exitCode = 1;
    } finally {
      await host.stop();
    }
  });

// 4. Asynchronous Queue Trigger
program
  .command('trigger <agentName>')
  .description('Schedule an agent workflow request to the database queue')
  .option('-c, --context <json>', 'JSON string of input arguments', '{}')
  .action(async (agentName, options) => {
    const host = await createBlueprintHost();
    try {
      const context = JSON.parse(options.context);
      console.log(`[Blueprint CLI] Triggering agent "${agentName}"...`);
      const request = await host.triggerAgent(agentName, context);
      console.log(
        JSON.stringify(
          {
            status: 'request_created',
            requestId: request.id,
            agent: agentName,
            scheduledAt: request.scheduledAt,
          },
          null,
          2
        )
      );
    } catch (err: any) {
      console.error('[Blueprint CLI] Trigger error:', err?.message || err);
      process.exitCode = 1;
    } finally {
      await host.stop();
    }
  });

// 5. Status Inspection
program
  .command('status')
  .description('Inspect current database state and summary counts')
  .action(async () => {
    const host = await createBlueprintHost();
    try {
      const toolsCount = await host.prisma.tool.count();
      const agentsCount = await host.prisma.agent.count();
      const requestsCount = await host.prisma.request.count();
      const responsesCount = await host.prisma.response.count();

      console.log(
        JSON.stringify(
          {
            database: 'SQLite',
            tools: toolsCount,
            agents: agentsCount,
            requests: requestsCount,
            responses: responsesCount,
          },
          null,
          2
        )
      );
    } catch (err: any) {
      console.error('[Blueprint CLI] Status error:', err?.message || err);
    } finally {
      await host.stop();
    }
  });

// 6. Interactive User Chat Client
program
  .command('chat [agentName]')
  .description('Start interactive human CLI terminal to communicate with dialog agents')
  .action(async (agentName) => {
    const readlineModule = await import('node:readline');
    const host = await createBlueprintHost();

    const rl = readlineModule.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const promptUser = (query: string): Promise<string> =>
      new Promise((resolve) => rl.question(query, resolve));

    console.log('====================================================');
    console.log('  👤 Curator User CLI Chat Client');
    console.log('====================================================\n');

    if (agentName) {
      console.log(`[Blueprint CLI] Triggering new session for agent "${agentName}"...`);
      await host.triggerAgent(agentName);
    }

    let isRunning = true;
    let lastSeenResponseId: number = 0;

    const latestExisting = await host.prisma.response.findFirst({
      orderBy: { id: 'desc' },
    });
    if (latestExisting) {
      lastSeenResponseId = latestExisting.id;
    }

    try {
      while (isRunning) {
        const waitingReq = await host.prisma.request.findFirst({
          where: { status: 'WAITING_FOR_USER' },
          orderBy: { updatedAt: 'desc' },
        });

        if (!waitingReq) {
          process.stdout.write('\r[CLI Client] Waiting for agent prompt... ');
          await new Promise((r) => setTimeout(r, 800));
          continue;
        }

        process.stdout.write('\r                                        \r');
        const promptText =
          (waitingReq.ast as any)?.prompt || 'Please enter your message:';

        console.log(`\n🤖 Agent [Req #${waitingReq.id}]:\n   ${promptText}\n`);
        const userInput = await promptUser('👤 You > ');

        if (!userInput.trim()) continue;

        const userResp = await host.prisma.response.create({
          data: {
            requestId: waitingReq.id,
            conversationId: waitingReq.conversationId,
            userId: waitingReq.userId,
            projectId: waitingReq.projectId,
            content: JSON.stringify({ output: userInput.trim() }),
          },
        });
        lastSeenResponseId = userResp.id;

        if (
          userInput.trim().toLowerCase() === 'exit' ||
          userInput.trim().toLowerCase() === 'quit'
        ) {
          console.log('\n[CLI Client] Exiting chat. Goodbye!');
          isRunning = false;
          break;
        }

        console.log('⏳ Processing turn...');
        let turnDone = false;
        const startTime = Date.now();

        while (!turnDone && Date.now() - startTime < 15000) {
          await new Promise((r) => setTimeout(r, 400));

          const newResponses = await host.prisma.response.findMany({
            where: {
              conversationId: waitingReq.conversationId,
              id: { gt: lastSeenResponseId },
            },
            orderBy: { id: 'asc' },
          });

          for (const resp of newResponses) {
            lastSeenResponseId = resp.id;
            try {
              const parsed = JSON.parse(resp.content);
              console.log(`\n📊 [Agent Output]:`, JSON.stringify(parsed, null, 2));
            } catch {
              console.log(`\n📊 [Agent Output]:`, resp.content);
            }
          }

          const updatedReq = await host.prisma.request.findUnique({
            where: { id: waitingReq.id },
          });

          if (
            updatedReq &&
            (updatedReq.status === 'COMPLETED' ||
              updatedReq.status === 'ERROR' ||
              updatedReq.status === 'WAITING_FOR_USER')
          ) {
            turnDone = true;
          }
        }
      }
    } finally {
      rl.close();
      await host.stop();
    }
  });

// 7. Background Agent Daemon
program
  .command('agent <agentName>')
  .description('Run background agent daemon listening and processing workflow turns')
  .action(async (agentName) => {
    console.log(`[Agent Daemon] Booting host and request processor for agent "${agentName}"...`);
    const host = await createBlueprintHost();
    await host.start(500);
    await host.seed();

    host.events.on('request:status_changed', (event: any) => {
      const { requestId, status } = event.payload || {};
      console.log(`[Agent Daemon] Request #${requestId} -> ${status}`);
    });

    console.log(`[Agent Daemon] Triggering "${agentName}"...`);
    const request = await host.triggerAgent(agentName);
    console.log(`[Agent Daemon] Active session request #${request.id} (Conversation: ${request.conversationId})`);
    console.log(`[Agent Daemon] Running. Use "npm run chat" in another terminal to communicate.\n`);

    const shutdown = async () => {
      console.log('\n[Agent Daemon] Stopping...');
      await host.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });

program.parse(process.argv);
