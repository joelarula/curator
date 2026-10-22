import type { CuratorAstNode, CuratorLoopNode } from './CuratorAst.js';

/** True when `schedule` is a syntax isScheduleDue understands (5-field cron, "every N unit", "at HH:MM"). */
export function isValidSchedule(schedule: string): boolean {
  if (!schedule || typeof schedule !== 'string') return false;
  const t = schedule.trim();
  if (/^(every|at|on|after)\b/i.test(t)) {
    return /^every\s+(\d+)?\s*(minute|hour|day)s?$/i.test(t) || /^at\s+\d{1,2}:\d{2}(?:\s*(am|pm))?$/i.test(t);
  }
  return t.split(/\s+/).length === 5;
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
