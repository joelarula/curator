import { openDatabase } from './db.js';
import { createErrRadioPlugin } from './plugins/err-radio.js';
import { registerKeerisPlugins } from './plugins/index.js';

export function startIndexer({ databasePath, curatorRuntime, intervalMs = 60_000, logger = console, runImmediate = true } = {}) {
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
          const tool = plugin.tools[toolName];
          if (tool) {
            const res = await tool.runAsync({ args: agent.args || {} });
            logger.log(`[AgentScheduler] Agent ${name} completed: ${res.episodesParsed ?? 0} parsed, ${res.tracksSaved ?? 0} tracks saved`);
          }
        }
      }
    } catch (error) {
      logger.error(`[AgentScheduler] Agent run failed: ${error.message}`);
    } finally {
      running = false;
    }
  };

  if (runImmediate) {
    runActiveAgents();
  }

  const timer = setInterval(runActiveAgents, intervalMs);
  return { db, run: runActiveAgents, stop: () => { clearInterval(timer); db.close(); } };
}