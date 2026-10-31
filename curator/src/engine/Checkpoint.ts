import { DbNull } from '@prisma/client-runtime-utils';
import { logger } from '../utils/logger.js';
import { TERMINAL_STATUSES } from './DeadLetters.js';
import { STATE_SEQ_KEY } from './ConversationStateLog.js';
import type { MaintenanceSystem } from './nodes/NodeHandler.js';

/**
 * The `checkpoint` durability tier (docs/DISTRIBUTED_STORAGE_PLAN.md, Phase 1): conversations run in an
 * in-process memory database and move to the durable database (SQLite/MariaDB/Postgres) at their first
 * suspension point (human input, an event wait, a timer, a pause) or when they finish. From then on they run
 * durable. The move is one way.
 *
 * Identity across the move:
 *  - Conversation ids come from the durable database (`withDurableConversationIds`), so a conversation keeps
 *    its id (tableId, sessions) when it moves.
 *  - Definitions (users, projects, roles, tools, scripts, agents, global subscriptions) are copied from the
 *    durable database with their ids (`mirrorDefinitions`).
 *  - Requests, responses, events and subscriptions created in memory get ids from `idBase` up and are given new
 *    durable ids when they move; every reference to them is rewritten (`demoteConversation`).
 */

export const DEFAULT_ID_BASE = 1_000_000_000;

/** Copied from durable to memory at startup, parents before children. */
const DEFINITION_MODELS = [
  'user', 'project', 'role', 'userRole', 'roleInheritance', 'projectRole', 'tool', 'toolRole', 'aIModel',
  'mcpServer', 'mcpResource', 'mcpPrompt', 'script', 'scriptVersion', 'agent', 'agentRole', 'eventSubscription',
];

/** Runtime tables whose durable ids must stay below `idBase`. */
const RUNTIME_MODELS = ['request', 'response', 'eventLog', 'eventSubscription', 'conversation', 'script', 'scriptVersion'];

/** Statuses a conversation can wait in indefinitely (a WAITING request with no lock waits on its children). */
const PARKED = new Set(['WAITING_FOR_USER', 'WAITING_FOR_EVENT', 'PAUSED']);

const SUMMARY_FOR = '__historySummaryFor';

interface ModelFields {
  scalars: string[];
  json: Set<string>;
}

function modelFields(prisma: any, delegate: string): ModelFields {
  const models = prisma._runtimeDataModel?.models ?? {};
  const name = Object.keys(models).find(m => m.charAt(0).toLowerCase() + m.slice(1) === delegate);
  if (!name) throw new Error(`[Checkpoint] Unknown model '${delegate}'`);
  const fields = models[name].fields.filter((f: any) => f.kind === 'scalar' || f.kind === 'enum');
  return { scalars: fields.map((f: any) => f.name), json: new Set(fields.filter((f: any) => f.type === 'Json').map((f: any) => f.name)) };
}

/** A row's scalar columns, as Prisma accepts them for a create (JSON nulls as DbNull). */
function scalarData(row: any, fields: ModelFields, omit: readonly string[] = []): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const key of fields.scalars) {
    if (omit.includes(key) || row[key] === undefined) continue;
    data[key] = row[key] === null && fields.json.has(key) ? DbNull : row[key];
  }
  return data;
}

/** Fails fast when a durable runtime id already reaches `idBase` (ids are 32-bit, so the ranges must not meet). */
export async function assertIdHeadroom(durable: any, idBase: number): Promise<void> {
  for (const delegate of RUNTIME_MODELS) {
    const max = (await durable[delegate]?.aggregate?.({ _max: { id: true } }))?._max?.id;
    if (typeof max === 'number' && max >= idBase) {
      throw new Error(`[Checkpoint] Durable ${delegate} ids reached ${max}, at or above the memory id base ${idBase}`);
    }
  }
}

/** Models keyed by more than `id`. */
const COMPOSITE_KEYS: Record<string, string[]> = { roleInheritance: ['parentId', 'subRoleId'] };

const uniqueWhere = (delegate: string, row: any) => {
  const keys = COMPOSITE_KEYS[delegate];
  return keys ? { [keys.join('_')]: Object.fromEntries(keys.map(k => [k, row[k]])) } : { id: row.id };
};

const GLOBAL_ONLY = (delegate: string) => (delegate === 'eventSubscription' ? { where: { conversationId: null } } : {});

/**
 * Copies the durable database's definitions into the memory database, ids included. `replace` first empties
 * the memory definitions (startup, before any request exists); otherwise rows are upserted, so a definition
 * written durably later (seed, project roles) reaches memory without disturbing running work.
 */
export async function mirrorDefinitions(durable: any, memory: any, options: { replace?: boolean } = {}): Promise<Record<string, number>> {
  const present = DEFINITION_MODELS.filter(d => durable[d]?.findMany && memory[d]?.createMany);
  if (options.replace) {
    if ((await memory.request.count()) > 0) throw new Error('[Checkpoint] Definitions can only be replaced before any request exists in memory');
    for (const d of [...present].reverse()) await memory[d].deleteMany(GLOBAL_ONLY(d));
  }
  const counts: Record<string, number> = {};
  for (const d of present) {
    const rows = await durable[d].findMany(GLOBAL_ONLY(d));
    const fields = modelFields(memory, d);
    if (options.replace) {
      if (rows.length) await memory[d].createMany({ data: rows.map((row: any) => scalarData(row, fields)) });
    } else {
      for (const row of rows) {
        const data = scalarData(row, fields);
        await memory[d].upsert({ where: uniqueWhere(d, row), create: data, update: data });
      }
    }
    counts[d] = rows.length;
  }
  return counts;
}

/**
 * Memory client whose new conversations are first created in the durable database and then mirrored with the
 * same id, so a conversation keeps its id when it moves.
 */
export function withDurableConversationIds(memory: any, durable: any): any {
  const fields = modelFields(memory, 'conversation');
  const reserve = async (data: any) => {
    const scalars = scalarData(data ?? {}, fields, ['id']);
    const project = data?.project?.connect?.id;
    const row = await durable.conversation.create({
      data: project != null && scalars.projectId === undefined ? { ...scalars, projectId: project } : scalars,
      select: { id: true, externalId: true },
    });
    return { ...data, id: row.id, externalId: row.externalId };
  };
  return memory.$extends({
    query: {
      conversation: {
        create: async ({ args, query }: any) => (args.data?.id != null ? query(args) : query({ ...args, data: await reserve(args.data) })),
        upsert: async ({ args, query }: any) => {
          const existing = await memory.conversation.findUnique({ where: args.where, select: { id: true } });
          return existing || args.create?.id != null ? query(args) : query({ ...args, create: await reserve(args.create) });
        },
        createMany: async () => {
          throw new Error('[Checkpoint] conversation.createMany is not supported on a checkpoint database; create conversations one by one');
        },
      },
    },
  });
}

interface LiveRequest {
  id: number;
  conversationId: number;
  status: string;
  lockedBy: string | null;
  scheduledAt: Date | null;
  pendingDependencies: number;
  parentId: number | null;
  notifyId: number | null;
}

/**
 * Conversations ready to move: they have requests, none is running or about to run (a timer due within
 * `minTimerMs` counts as about to run), and no request links them to another memory conversation.
 */
export async function checkpointCandidates(memory: any, options: { now: Date; minTimerMs: number; idBase: number }): Promise<number[]> {
  const live: LiveRequest[] = await memory.request.findMany({
    where: { status: { notIn: [...TERMINAL_STATUSES] } },
    select: { id: true, conversationId: true, status: true, lockedBy: true, scheduledAt: true, pendingDependencies: true, parentId: true, notifyId: true },
  });
  const timerHorizon = options.now.getTime() + options.minTimerMs;
  const busy = new Set<number>();
  const conversationOf = new Map(live.map(r => [r.id, r.conversationId]));
  for (const r of live) {
    // A parked status keeps the lock of the worker that parked it; for WAITING/NEW a lock means running
    const parked =
      PARKED.has(r.status) ||
      (r.lockedBy == null &&
        ((r.status === 'WAITING' && r.pendingDependencies > 0) ||
          (r.status === 'NEW' && (r.pendingDependencies > 0 || (r.scheduledAt != null && r.scheduledAt.getTime() > timerHorizon)))));
    if (!parked) busy.add(r.conversationId);
  }
  // Links across conversations would break when only one side moves: keep both in memory
  const all: Array<{ id: number; conversationId: number; parentId: number | null; notifyId: number | null }> = await memory.request.findMany({
    where: { OR: [{ parentId: { gte: options.idBase } }, { notifyId: { gte: options.idBase } }] },
    select: { id: true, conversationId: true, parentId: true, notifyId: true },
  });
  const owner = new Map<number, number>(conversationOf);
  const unknown = all.flatMap(r => [r.parentId, r.notifyId]).filter((id): id is number => id != null && !owner.has(id));
  if (unknown.length) {
    for (const r of await memory.request.findMany({ where: { id: { in: unknown } }, select: { id: true, conversationId: true } })) {
      owner.set(r.id, r.conversationId);
    }
  }
  for (const r of all) {
    for (const ref of [r.parentId, r.notifyId]) {
      const other = ref != null ? owner.get(ref) : undefined;
      if (other != null && other !== r.conversationId) {
        busy.add(r.conversationId);
        busy.add(other);
      }
    }
  }
  const withRequests: Array<{ conversationId: number }> = await memory.request.groupBy({ by: ['conversationId'] });
  return withRequests.map(r => r.conversationId).filter(id => !busy.has(id));
}

export interface DemoteResult {
  conversationId: number;
  requests: number;
  responses: number;
  events: number;
  subscriptions: number;
  /** Memory request id -> durable request id. */
  requestIds: Map<number, number>;
}

/** Rewrites the request ids that structured records and contexts store as data. */
function remapContent(content: string, requestIds: Map<number, number>, subscriptionIds: Map<number, number>): string {
  if (!content.startsWith('{')) return content;
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    return content;
  }
  if (parsed?.type === 'HISTORY_SUMMARY' && requestIds.has(parsed.summary?.throughRequestId)) {
    parsed.summary.throughRequestId = requestIds.get(parsed.summary.throughRequestId);
    return JSON.stringify(parsed);
  }
  if (parsed?.type === 'SUBSCRIBED' && subscriptionIds.has(parsed.metadata?.subscriptionId)) {
    parsed.metadata.subscriptionId = subscriptionIds.get(parsed.metadata.subscriptionId);
    return JSON.stringify(parsed);
  }
  return content;
}

function remapContext(context: any, requestIds: Map<number, number>): any {
  const marker = context?.[SUMMARY_FOR];
  if (typeof marker !== 'string') return context;
  // `${key}|${throughRequestId}|${earlierLength}`; the key itself may contain '|'
  const parts = marker.split('|');
  const through = Number(parts[parts.length - 2]);
  if (!requestIds.has(through)) return context;
  parts[parts.length - 2] = String(requestIds.get(through));
  return { ...context, [SUMMARY_FOR]: parts.join('|') };
}

/**
 * Copies one conversation from memory to the durable database in a single durable transaction, then deletes
 * the copied rows from memory. Callers make sure nothing runs in the conversation meanwhile (see
 * `checkpointCandidates` and CheckpointManager). Returns null when the conversation cannot move (yet).
 */
export async function demoteConversation(memory: any, durable: any, conversationId: number, idBase: number): Promise<DemoteResult | null> {
  const conversation = await memory.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) return null;
  const requests = await memory.request.findMany({ where: { conversationId }, orderBy: { id: 'asc' } });
  const ownIds = new Set<number>(requests.map((r: any) => r.id));
  const responses = await memory.response.findMany({
    where: { OR: [{ conversationId }, { requestId: { in: [...ownIds] } }] },
    orderBy: { id: 'asc' },
  });
  const events = await memory.eventLog.findMany({ where: { conversationId }, orderBy: { id: 'asc' } });
  const subscriptions = await memory.eventSubscription.findMany({ where: { conversationId }, orderBy: { id: 'asc' } });
  if (ownIds.size) {
    const links = (await memory.$queryRawUnsafe(
      `SELECT COUNT(*) AS n FROM _RequestResources WHERE A IN (${[...ownIds].map(() => '?').join(',')})`,
      ...ownIds
    ).catch(() => [{ n: 0 }])) as Array<{ n: unknown }>;
    if (Number(links[0]?.n) > 0) {
      logger.warn(`[Checkpoint] Conversation ${conversationId} links resources to requests; it stays in memory (not supported yet)`);
      return null;
    }
  }

  const requestFields = modelFields(durable, 'request');
  const responseFields = modelFields(durable, 'response');
  const eventFields = modelFields(durable, 'eventLog');
  const subscriptionFields = modelFields(durable, 'eventSubscription');
  const scriptFields = modelFields(durable, 'script');
  const versionFields = modelFields(durable, 'scriptVersion');
  const agentFields = modelFields(durable, 'agent');

  const requestIds = new Map<number, number>();
  const eventIds = new Map<number, number>();
  const subscriptionIds = new Map<number, number>();
  const scriptIds = new Map<number, number>();
  const agentIds = new Map<string, string>();

  await durable.$transaction(
    async (tx: any) => {
      // Definitions created in memory after startup (ad-hoc scripts, agents) are matched or created by name
      const durableScript = async (id: number | null): Promise<number | null> => {
        if (id == null || id < idBase) return id;
        if (scriptIds.has(id)) return scriptIds.get(id)!;
        const script = await memory.script.findUnique({ where: { id }, include: { versions: true } });
        if (!script) return null;
        let target = await tx.script.findUnique({ where: { name: script.name } });
        if (!target) {
          target = await tx.script.create({ data: scalarData(script, scriptFields, ['id']) });
          for (const v of script.versions ?? []) {
            await tx.scriptVersion.create({ data: { ...scalarData(v, versionFields, ['id', 'scriptId']), scriptId: target.id } });
          }
        }
        scriptIds.set(id, target.id);
        return target.id;
      };
      const durableAgent = async (id: string | null): Promise<string | null> => {
        if (id == null) return null;
        if (agentIds.has(id)) return agentIds.get(id)!;
        let target = await tx.agent.findUnique({ where: { id } });
        if (!target) {
          const agent = await memory.agent.findUnique({ where: { id } });
          if (!agent) return null;
          await ensureOwners(agent);
          target =
            (await tx.agent.findUnique({ where: { name: agent.name } })) ??
            (await tx.agent.create({ data: { ...scalarData(agent, agentFields), scriptId: await durableScript(agent.scriptId) } }));
        }
        agentIds.set(id, target.id);
        return target.id;
      };
      // Users and projects are keyed by string ids, so one created in memory is copied as is
      const ensured = new Set<string>();
      const ensureRow = async (model: 'user' | 'project', id: string | null | undefined): Promise<void> => {
        if (id == null || ensured.has(`${model}:${id}`)) return;
        ensured.add(`${model}:${id}`);
        if (await tx[model].findUnique({ where: { id }, select: { id: true } })) return;
        const row = await memory[model].findUnique({ where: { id } });
        if (!row) return;
        if (model === 'project') await ensureRow('user', row.userId);
        await tx[model].create({ data: scalarData(row, modelFields(durable, model)) });
      };
      const ensureOwners = async (row: { userId?: string | null; projectId?: string | null }) => {
        await ensureRow('user', row.userId);
        await ensureRow('project', row.projectId);
      };
      const mapRequest = (id: number | null) => (id == null || id < idBase ? id : requestIds.get(id) ?? null);

      // Parents before children: request ids ascend in creation order
      await ensureOwners(conversation);
      for (const r of requests) {
        await ensureOwners(r);
        const data = scalarData(r, requestFields, ['id', 'eventCursor', 'context']);
        const row = await tx.request.create({
          data: {
            ...data,
            parentId: mapRequest(r.parentId),
            notifyId: mapRequest(r.notifyId),
            scriptId: await durableScript(r.scriptId),
            agentId: await durableAgent(r.agentId),
            aiModelId: r.aiModelId != null && r.aiModelId >= idBase ? null : r.aiModelId,
          },
          select: { id: true },
        });
        requestIds.set(r.id, row.id);
      }
      // notifyId is not a foreign key: a parent may notify a later request, so fix those after all exist
      for (const r of requests) {
        const parentId = mapRequest(r.parentId);
        const notifyId = mapRequest(r.notifyId);
        const context = r.context == null ? DbNull : remapContext(r.context, requestIds);
        await tx.request.update({ where: { id: requestIds.get(r.id) }, data: { parentId, notifyId, context } });
      }
      for (const e of events) {
        const row = await tx.eventLog.create({
          data: { ...scalarData(e, eventFields, ['id']), source: mapRequest(e.source) },
          select: { id: true },
        });
        eventIds.set(e.id, row.id);
      }
      for (const r of requests) {
        if (r.eventCursor == null) continue;
        const eventCursor = r.eventCursor < idBase ? r.eventCursor : eventIds.get(r.eventCursor) ?? null;
        await tx.request.update({ where: { id: requestIds.get(r.id) }, data: { eventCursor } });
      }
      for (const s of subscriptions) {
        await ensureOwners(s);
        const row = await tx.eventSubscription.create({
          data: { ...scalarData(s, subscriptionFields, ['id']), scriptId: await durableScript(s.scriptId), agentId: await durableAgent(s.agentId) },
          select: { id: true },
        });
        subscriptionIds.set(s.id, row.id);
      }
      for (const r of responses) {
        await ensureOwners({ projectId: r.projectId });
        await tx.response.create({
          data: {
            ...scalarData(r, responseFields, ['id']),
            requestId: mapRequest(r.requestId),
            content: remapContent(r.content, requestIds, subscriptionIds),
            aiModelId: r.aiModelId != null && r.aiModelId >= idBase ? null : r.aiModelId,
          },
        });
      }
      const metadata = conversation.metadata && typeof conversation.metadata === 'object' ? { ...conversation.metadata } : conversation.metadata;
      const seq = metadata?.[STATE_SEQ_KEY];
      if (typeof seq === 'number' && seq >= idBase) metadata[STATE_SEQ_KEY] = eventIds.get(seq) ?? 0;
      await tx.conversation.update({
        where: { id: conversationId },
        data: { metadata: metadata ?? DbNull, existent: conversation.existent, deletedAt: conversation.deletedAt },
      });
    },
    { timeout: 60_000, maxWait: 10_000 }
  );

  // Only what was copied: a row that arrived meanwhile stays in memory instead of being lost
  await memory.response.deleteMany({ where: { id: { in: responses.map((r: any) => r.id) } } });
  await memory.eventSubscription.deleteMany({ where: { id: { in: subscriptions.map((s: any) => s.id) } } });
  await memory.eventLog.deleteMany({ where: { id: { in: events.map((e: any) => e.id) } } });
  await memory.request.updateMany({ where: { id: { in: [...ownIds] } }, data: { parentId: null } });
  await memory.request.deleteMany({ where: { id: { in: [...ownIds] } } });
  if ((await memory.request.count({ where: { conversationId } })) === 0) {
    await memory.conversation.delete({ where: { id: conversationId } });
  } else {
    logger.warn(`[Checkpoint] Conversation ${conversationId} received requests while it moved; they stay in memory`);
  }

  return {
    conversationId,
    requests: requests.length,
    responses: responses.length,
    events: events.length,
    subscriptions: subscriptions.length,
    requestIds,
  };
}

export interface CheckpointOptions {
  idBase?: number;
  /** A timer due sooner than this is about to run, so the conversation stays in memory. Default 5s. */
  minTimerMs?: number;
  /** Most remembered memory->durable request ids (for callers holding an id from before a move). Default 10000. */
  rememberIds?: number;
  now?: () => number;
}

/**
 * Moves suspended and finished conversations from memory to the durable database (as a maintenance system on
 * the memory processor) and tells callers where a conversation lives now.
 */
export class CheckpointManager {
  readonly idBase: number;
  private readonly minTimerMs: number;
  private readonly rememberIds: number;
  private readonly now: () => number;
  private readonly moving = new Map<number, Promise<unknown>>();
  private readonly movedRequestIds = new Map<number, number>();

  constructor(private readonly memory: any, private readonly durable: any, options: CheckpointOptions = {}) {
    this.idBase = options.idBase ?? DEFAULT_ID_BASE;
    this.minTimerMs = options.minTimerMs ?? 5_000;
    this.rememberIds = options.rememberIds ?? 10_000;
    this.now = options.now ?? Date.now;
  }

  /** True while the conversation is still in memory (wait for an ongoing move first). */
  async inMemory(conversationId: number): Promise<boolean> {
    await this.moving.get(conversationId);
    return (await this.memory.conversation.findUnique({ where: { id: conversationId }, select: { id: true } })) != null;
  }

  /** The durable id of a request that moved, or the id unchanged. */
  durableRequestId(id: number): number {
    return this.movedRequestIds.get(id) ?? id;
  }

  /** Moves every conversation that is ready. Returns the moves made. */
  async checkpoint(): Promise<DemoteResult[]> {
    const results: DemoteResult[] = [];
    const ids = await checkpointCandidates(this.memory, { now: new Date(this.now()), minTimerMs: this.minTimerMs, idBase: this.idBase });
    for (const conversationId of ids) {
      const move = demoteConversation(this.memory, this.durable, conversationId, this.idBase);
      this.moving.set(conversationId, move.catch(() => undefined));
      try {
        const result = await move;
        if (result) {
          results.push(result);
          this.remember(result.requestIds);
          logger.debug(`[Checkpoint] Conversation ${conversationId} moved to the durable database (${result.requests} requests)`);
        }
      } catch (err: any) {
        logger.error(`[Checkpoint] Moving conversation ${conversationId} failed; it stays in memory: ${err?.message || err}`);
      } finally {
        this.moving.delete(conversationId);
      }
    }
    return results;
  }

  maintenanceSystem(onMoved?: (results: DemoteResult[]) => void): MaintenanceSystem {
    return {
      name: 'checkpointConversations',
      run: async () => {
        const moved = await this.checkpoint();
        if (moved.length) onMoved?.(moved);
      },
    };
  }

  private remember(ids: Map<number, number>) {
    for (const [from, to] of ids) this.movedRequestIds.set(from, to);
    for (const key of this.movedRequestIds.keys()) {
      if (this.movedRequestIds.size <= this.rememberIds) break;
      this.movedRequestIds.delete(key);
    }
  }
}
