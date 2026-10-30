import { Command } from 'commander';
import { setLogLevel } from '@curator/agent-server';
import type { CuratorHost, ShellAuthManager } from '../types.js';
import { ShellAuthController } from './shellAuth.js';
import { parseProfiles } from '../appConfig.js';

export interface HostCliOptions {
  name?: string;
  description?: string;
  version?: string;
  defaultTimeout?: number;
  program?: Command;
  /** Enables the `auth` command (e.g. `() => AuthSessionManager.fromConfigFile()` from `@curator/auth-client`). */
  auth?: ShellAuthManager | (() => ShellAuthManager | Promise<ShellAuthManager>);
}

function parseJsonArg(str: string): any {
  if (!str || str.trim() === '{}') return {};
  try {
    return JSON.parse(str);
  } catch {
    try {
      const fixed = str.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
      return JSON.parse(fixed);
    } catch {
      return {};
    }
  }
}

/**
 * Creates a standardized Commander CLI program attached to a Curator Host factory.
 * Provides all standard commands (seed, exec, run, trigger, status, chat, agent)
 * without requiring MiniApps to write boilerplate.
 */
export function createHostCli(
  hostFactory: (options?: any) => Promise<CuratorHost>,
  options: HostCliOptions = {}
): Command {
  const program = options.program || new Command();

  if (!options.program) {
    program
      .name(options.name || 'curator-host')
      .description(options.description || 'Curator Host Command Line Interface')
      .version(options.version || '1.0.0');
  }

  program
    .option('--log-level <level>', 'Set log level (error, warn, info, debug, silent)')
    .option('--debug', 'Enable debug log level')
    .option('--profile <names>', 'Active app config profiles, comma separated (sets CURATOR_PROFILES)')
    .hook('preAction', (thisCommand) => {
      const opts = thisCommand.opts();
      if (opts.profile) process.env.CURATOR_PROFILES = parseProfiles(opts.profile).join(',');
      if (opts.debug) {
        setLogLevel('debug');
      } else if (opts.logLevel) {
        setLogLevel(opts.logLevel);
      }
    });

  // 1. Database Seeding
  program
    .command('seed')
    .description('Idempotently initialize database and seed tools and agent workflows')
    .option('-r, --reset', 'Force reset and wipe database before seeding', false)
    .action(async (opts: { reset?: boolean }) => {
      console.log('[Host CLI] Initializing host and database...');
      const host = await hostFactory(opts?.reset ? { forceReset: true } : undefined);
      try {
        console.log(`[Host CLI] Seeding host tools and agents...`);
        const result = await host.seed();
        console.log(JSON.stringify({ status: 'seed_complete', ...result }, null, 2));
      } finally {
        await host.stop();
      }
    });

  // 2. Direct Tool Execution (In-Process Synchronous Run)
  program
    .command('exec <toolName>')
    .description('Directly execute a registered Curator tool in-process and print output')
    .option('-a, --args <json>', 'JSON arguments passed to the tool', '{}')
    .action(async (toolName: string, opts: { args: string }) => {
      console.log(`[Host CLI] Booting host runtime to execute "${toolName}"...`);
      const host = await hostFactory();
      try {
        const tool = host.engine.tools.get(toolName);
        if (!tool) {
          throw new Error(
            `Tool "${toolName}" not found. Available: ${[...host.engine.tools.keys()].join(', ')}`
          );
        }

        const args = parseJsonArg(opts.args);
        console.log(`[Host CLI] Executing tool "${toolName}" as a Request...`);

        // Actor/scope come from the host session (system user, default project/conversation).
        const { requestId, status, result } = await host.runTool(toolName, args, { origin: 'CLI' });

        console.log(JSON.stringify({ tool: toolName, requestId, status: status === 'COMPLETED' ? 'completed' : status, output: result }, null, 2));
      } catch (err: any) {
        console.error('[Host CLI] Execution error:', err?.message || err);
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
    .option('-t, --timeout <seconds>', 'Timeout in seconds', String(options.defaultTimeout || 30))
    .action(async (agentName: string, opts: { context: string; timeout: string }) => {
      const host = await hostFactory();
      try {
        const context = parseJsonArg(opts.context);
        console.log(`[Host CLI] Triggering agent "${agentName}"...`);
        const request = await host.triggerAgent(agentName, context);
        console.log(`[Host CLI] Request #${request.id} queued. Processing in terminal...`);

        await host.start(1000);

        const timeoutMs = Number(opts.timeout) * 1000;
        const startTime = Date.now();

        let done = false;
        while (!done) {
          if (Date.now() - startTime > timeoutMs) {
            throw new Error(`Workflow timed out after ${opts.timeout}s`);
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
        console.error('[Host CLI] Agent run error:', err?.message || err);
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
    .action(async (agentName: string, opts: { context: string }) => {
      const host = await hostFactory();
      try {
        const context = parseJsonArg(opts.context);
        console.log(`[Host CLI] Triggering agent "${agentName}"...`);
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
        console.error('[Host CLI] Trigger error:', err?.message || err);
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
      const host = await hostFactory();
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
        console.error('[Host CLI] Status error:', err?.message || err);
      } finally {
        await host.stop();
      }
    });

  // 6. Interactive User Chat Client
  program
    .command('chat [agentName]')
    .description('Start interactive human CLI terminal to communicate with dialog agents')
    .action(async (agentName?: string) => {
      const readlineModule = await import('node:readline');
      const host = await hostFactory();

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
        console.log(`[Host CLI] Triggering new session for agent "${agentName}"...`);
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
    .action(async (agentName: string) => {
      console.log(`[Agent Daemon] Booting host and request processor for agent "${agentName}"...`);
      const host = await hostFactory();
      await host.start(500);
      await host.seed();

      host.events.on('request:status_changed', (event: any) => {
        const { requestId, status } = event.payload || {};
        console.log(`[Agent Daemon] Request #${requestId} -> ${status}`);
      });

      console.log(`[Agent Daemon] Triggering "${agentName}"...`);
      const request = await host.triggerAgent(agentName);
      console.log(`[Agent Daemon] Active session request #${request.id} (Conversation: ${request.conversationId})`);
      console.log(`[Agent Daemon] Running. Use "chat" command in another terminal to communicate.\n`);

      const shutdown = async () => {
        console.log('\n[Agent Daemon] Stopping...');
        await host.stop();
        process.exit(0);
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    });

  // 8. Tool Whitelist & Registry Inspection
  program
    .command('tools')
    .description('List all registered and permitted Curator tools in the host runtime')
    .action(async () => {
      console.log(`[Host CLI] Inspecting registered tools...`);
      const host = await hostFactory();
      try {
        console.log('\n\x1b[1m\x1b[36m=== Registered Curator Host Tools ===\x1b[0m');
        for (const [name, tool] of host.engine.tools.entries()) {
          const desc = tool.description || '(no description)';
          console.log(`  \x1b[32m${name.padEnd(38)}\x1b[0m ${desc}`);
        }
        console.log('');
      } finally {
        await host.stop();
      }
    });

  // 9. IdP sessions (device-flow login in the browser); no host boot needed
  if (options.auth) {
    const authSource = options.auth;
    program
      .command('auth [action] [target]')
      .description(`Manage IdP sessions: ${ShellAuthController.usage}`)
      .option('--open', 'Open the verification link in the system browser')
      .action(async (action: string | undefined, target: string | undefined, opts: { open?: boolean }) => {
        const manager = typeof authSource === 'function' ? await authSource() : authSource;
        const controller = new ShellAuthController(manager, { openBrowser: opts.open });
        try {
          if (action === 'login' && target) {
            const identity = await controller.startLogin(target);
            if (!identity) process.exitCode = 1;
          } else {
            await controller.command(action, target);
          }
        } catch (err: any) {
          console.error('[Host CLI] Auth error:', err?.message || err);
          process.exitCode = 1;
        }
      });
  }

  return program;
}
