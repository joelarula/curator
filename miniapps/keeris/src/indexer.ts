import { openDatabase } from './db.ts';
import { createErrRadioPlugin } from './plugins/err-radio.ts';
import { registerKeerisPlugins } from './plugins/index.ts';

export interface StartIndexerOptions {
  databasePath: string;
  curatorRuntime?: any;
  intervalMs?: number;
  logger?: { log: (...args: any[]) => void; error: (...args: any[]) => void };
  runImmediate?: boolean;
}

export function startIndexer({
  databasePath,
  curatorRuntime,
  intervalMs = 60_000,
  logger = console,
  runImmediate = true,
}: StartIndexerOptions) {
  const db = openDatabase(databasePath);
  const plugin = createErrRadioPlugin(db);
  let running = false;

  const runActiveAgents = async () => {
    if (running) return;
    running = true;
    try {
      const engine = await registerKeerisPlugins({ db });
      const activeAgents = engine.getActiveAgents();
      for (const { name, definition: agent } of activeAgents) {
        logger.log(`[AgentScheduler] Running scheduled agent: ${name}`);
        if (curatorRuntime && typeof curatorRuntime.triggerAgent === 'function') {
          await curatorRuntime.triggerAgent(name, agent.args || {});
          logger.log(`[AgentScheduler] Created Request task for agent ${name} in Curator database.`);
        } else {
          const toolName = agent.toolName || 'keeris_scrape';
          const tool = (plugin.tools as any)[toolName];
          if (tool) {
            const res = await tool.runAsync({ args: agent.args || {} });
            logger.log(`[AgentScheduler] Agent ${name} completed: ${res?.episodesParsed ?? 0} parsed, ${res?.tracksSaved ?? 0} tracks saved`);
          }
        }
      }
    } catch (error: any) {
      logger.error(`[AgentScheduler] Agent run failed: ${error?.message}`);
    } finally {
      running = false;
    }
  };

  if (runImmediate) {
    runActiveAgents();
  }

  // When Curator runtime is active, agent scheduling and AST Request execution are orchestrated natively.
  // In standalone fallback mode without Curator, run fallback timer.
  const timer = curatorRuntime ? null : setInterval(runActiveAgents, intervalMs);
  return {
    db,
    run: runActiveAgents,
    stop: () => {
      if (timer) clearInterval(timer);
      db.close();
    },
  };
}
