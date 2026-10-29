import type { CuratorAstNode, CuratorLoopNode } from './CuratorAst.js';

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

/** True when `schedule` is a syntax isScheduleDue understands (5-field cron, "every N unit", "at HH:MM"). */
export function isValidSchedule(schedule: string): boolean {
  if (!schedule || typeof schedule !== 'string') return false;
  const t = schedule.trim();
  if (/^(every|at|on|after)\b/i.test(t)) {
    return /^every\s+(\d+)?\s*(minute|hour|day|second)s?$/i.test(t) || /^at\s+\d{1,2}:\d{2}(?:\s*(am|pm))?$/i.test(t);
  }
  return t.split(/\s+/).length === 5;
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

  // 2. Bree / Human interval syntax ("every X minutes/hours/days/seconds")
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

  return false;
}

/** Calculates the next upcoming Date matching the schedule (cron or interval) starting from fromDate. */
export function computeNextRunDate(schedule: string, fromDate: Date = new Date()): Date {
  if (!schedule || typeof schedule !== 'string') {
    return new Date(fromDate.getTime() + 60000);
  }
  const trimmed = schedule.trim();
  const start = new Date(Math.floor((fromDate.getTime() + 60000) / 60000) * 60000);
  start.setSeconds(0, 0);

  // Search up to 366 days in advance
  const maxMinutes = 60 * 24 * 366;
  const current = new Date(start.getTime());

  for (let i = 0; i < maxMinutes; i++) {
    if (isScheduleDue(trimmed, current)) {
      return current;
    }
    current.setTime(current.getTime() + 60000);
  }

  return new Date(fromDate.getTime() + 3600000);
}

const LIVE_STATUSES = ['NEW', 'WAITING', 'PAUSED'];

/** The scheduled form of an Agent: its script wrapped in a scheduler Curator_Loop. */
export function buildAgentLoop(agent: { name: string; schedule: string }, scriptAst: CuratorAstNode): CuratorLoopNode {
  return { type: 'Curator_Loop', name: `agent:${agent.name}`, schedule: agent.schedule, agent: scriptAst };
}

const parseAst = (ast: any) => (typeof ast === 'string' ? JSON.parse(ast) : ast);

/** Live (not finished) root loop requests owned by an agent. */
export async function findLiveAgentLoops(prisma: any, agentId: string) {
  const rows = await prisma.request.findMany({
    where: { agentId, status: { in: LIVE_STATUSES }, parentId: null }
  });
  return rows.filter((r: any) => {
    try { return parseAst(r.ast)?.type === 'Curator_Loop'; } catch { return false; }
  });
}

/** Cancels an agent's live loops together with the iterations they still have queued. Returns the number of requests cancelled. */
export async function cancelAgentLoops(prisma: any, agentId: string, loops?: any[]): Promise<number> {
  const live = loops ?? await findLiveAgentLoops(prisma, agentId);
  if (!live.length) return 0;
  const rootIds = new Set<number>(live.map((r: any) => r.id));
  const queued = await prisma.request.findMany({ where: { agentId, status: { in: LIVE_STATUSES } } });
  // Iterations are notify-children of the loop; collect them transitively.
  const ids = new Set<number>(rootIds);
  let grew = true;
  while (grew) {
    grew = false;
    for (const r of queued) {
      if (!ids.has(r.id) && (ids.has(r.notifyId) || ids.has(r.parentId))) { ids.add(r.id); grew = true; }
    }
  }
  const res = await prisma.request.updateMany({
    where: { id: { in: [...ids] }, status: { in: LIVE_STATUSES } },
    data: { status: 'CANCELLED', lockedBy: null, lockedAt: null }
  });
  return res?.count ?? ids.size;
}

export interface SuperviseResult { started: string[]; cancelled: string[]; restarted: string[] }

/**
 * Reconciles Agent rows with their scheduler loops:
 * enabled + schedule + no live loop -> start one; disabled -> cancel; schedule/script changed -> restart.
 */
export async function superviseAgentLoops(
  prisma: any,
  createLoopRequest: (agent: any, loopAst: CuratorLoopNode) => Promise<unknown>
): Promise<SuperviseResult> {
  const result: SuperviseResult = { started: [], cancelled: [], restarted: [] };
  const agents = await prisma.agent.findMany({ include: { script: true } });

  for (const agent of agents) {
    const loops = await findLiveAgentLoops(prisma, agent.id);
    const wanted = agent.enabled && agent.existent !== false && !agent.deletedAt && agent.schedule && agent.script?.ast;

    if (!wanted) {
      if (loops.length && await cancelAgentLoops(prisma, agent.id, loops)) result.cancelled.push(agent.name);
      continue;
    }

    const desired = buildAgentLoop(agent, parseAst(agent.script.ast));
    const current = loops.find((l: any) => JSON.stringify(parseAst(l.ast)) === JSON.stringify(desired));
    if (current) {
      // Any further duplicates are stale.
      const extras = loops.filter((l: any) => l.id !== current.id);
      if (extras.length) await cancelAgentLoops(prisma, agent.id, extras);
      continue;
    }

    if (loops.length) {
      await cancelAgentLoops(prisma, agent.id, loops);
      result.restarted.push(agent.name);
    } else {
      result.started.push(agent.name);
    }
    await createLoopRequest(agent, desired);
  }
  return result;
}
