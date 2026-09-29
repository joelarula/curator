import { openDatabase } from './db.ts';
import { createErrRadioPlugin } from './plugins/err-radio.ts';
import { registerKeerisPlugins } from './plugins/index.ts';

export interface StartIndexerOptions {
  databasePath: string;
  curatorRuntime?: any;
  getCuratorRuntime?: () => any;
  intervalMs?: number;
  logger?: { log: (...args: any[]) => void; error: (...args: any[]) => void };
  runImmediate?: boolean;
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

  return isCronDue(trimmed, date);
}

export function startIndexer({
  databasePath,
  curatorRuntime,
  getCuratorRuntime,
  intervalMs = 60_000,
  logger = console,
  runImmediate = false,
}: StartIndexerOptions) {
  const db = openDatabase(databasePath);
  const plugin = createErrRadioPlugin(db);
  let running = false;

  const getRuntime = () => (typeof getCuratorRuntime === 'function' ? getCuratorRuntime() : curatorRuntime);

  const runScheduledAgents = async (forceAll = false) => {
    if (running) return;
    running = true;
    try {
      const engine = await registerKeerisPlugins({ db });
      const scheduledAgents = engine.getScheduledAgents();
      const runtime = getRuntime();
      const now = new Date();

      // Check DB agent enabled overrides if available
      let dbAgentMap: Map<string, boolean> = new Map();
      if (runtime?.prisma?.agent) {
        try {
          const dbAgents = await runtime.prisma.agent.findMany({ select: { name: true, enabled: true } });
          for (const a of dbAgents) dbAgentMap.set(a.name, a.enabled);
        } catch (_) {}
      }

      for (const { name, schedule, enabled, definition: agent } of scheduledAgents) {
        const isEnabled = dbAgentMap.has(name) ? dbAgentMap.get(name)! : enabled;
        if (!isEnabled) continue;

        const isDue = forceAll || isScheduleDue(schedule, now);
        if (!isDue) continue;

        logger.log(`[AgentScheduler] Running scheduled agent: ${name} (schedule: ${schedule})`);
        if (runtime && typeof runtime.triggerAgent === 'function') {
          await runtime.triggerAgent(name, agent.args || {});
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
    runScheduledAgents(true);
  }

  const timer = setInterval(() => runScheduledAgents(false), intervalMs);
  return {
    db,
    run: (forceAll = true) => runScheduledAgents(forceAll),
    stop: () => {
      if (timer) clearInterval(timer);
      db.close();
    },
  };
}
