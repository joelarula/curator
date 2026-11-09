/**
 * Checkpoints, fork and replay (docs/ENGINE_EVOLUTION_PLAN.md, Phase C).
 *
 * Every request records the request that created it (`Request.createdBy`), so a run is a tree. A step's path is its
 * position in that tree: `r` for the root, then `.k` for the k-th request its creator created (`r.0.2`). Replayable
 * steps (agents, tools, reducers, human input, event waits) record their node hash and final context in `StepTrace`
 * (request contexts are trimmed); their result is their Response (control steps: `StepTrace.output`) and the state
 * they wrote is in the EventLog (`source`).
 *
 * A fork is a new conversation that runs the original root again. Each request it creates gets the path of its
 * position (`context.__forkPath`). When a replayable step of the fork has a
 * finished original at the same path, with the same node, that finished no later than the fork point, the recorded
 * result is returned instead of running it: tools are not called again, agents do not call the model, prompts do
 * not ask again. The fork point's step gets the fork's `statePatch` right after it; later steps run live.
 */
import { hashAst } from './ScriptRegistry.js';
import { ENGINE_PROGRESS_KEYS } from './RequestContextStorage.js';
import { defineService } from './nodes/NodeHandler.js';
import type { ConversationStateData } from './ConversationStateLog.js';

/** EventLog events of a fork conversation (not state events: they never enter the state fold). */
export const FORK_EVENT = '__fork';
export const FORK_BOUNDARY_EVENT = '__fork.boundary';

/** Context key (forks only): the step's path. */
export const FORK_PATH_KEY = '__forkPath';
export const ROOT_PATH = 'r';

/** Steps whose recorded result a fork returns instead of running them (everything else runs again: control flow). */
export const REPLAYABLE_NODE_TYPES: ReadonlySet<string> = new Set([
  'Curator_Agent',
  'Curator_Tool',
  'Curator_Reduce',
  'Curator_HumanInput',
  'Curator_WaitEvent',
]);

/** Context keys that describe the engine's bookkeeping of one run, not the step's data (never copied by a fork). */
export const RUN_BOOKKEEPING_KEYS: readonly string[] = [
  ...ENGINE_PROGRESS_KEYS, FORK_PATH_KEY, '__deadLetter', '__hooksExpanded__', 'state', 'input',
  // Control-flow progress not carried between steps (a fork re-runs control flow from the start)
  'activeNode', 'stateData', 'waitingFor', 'nextNode', 'callPending', 'callReturns', 'callAs', 'interruptHandled',
];

export const withoutBookkeeping = (context: any): Record<string, any> => {
  const out: Record<string, any> = { ...(context && typeof context === 'object' ? context : {}) };
  for (const key of RUN_BOOKKEEPING_KEYS) delete out[key];
  return out;
};

export const nodeHash = (node: unknown): string => hashAst(node);

export interface ForkSpec {
  /** The conversation forked from. */
  from: number;
  /** The fork point: a finished replayable step of `from`. */
  atRequestId: number;
  /** Its path; the fork's step at this path gets `statePatch` once replayed. */
  boundaryPath: string;
  /** The original root request (path `r`). */
  rootRequestId: number;
  /** When the fork point finished (see `FinishOrder`): original steps that finished later run live. */
  atFinished: FinishOrder;
  statePatch?: Record<string, any> | null;
  /** Script version the fork runs; when it differs from the original's, changed steps run live instead of diverging. */
  scriptVersion?: number | null;
  originalScriptVersion?: number | null;
}

/** What a fork needs of one original step. */
/**
 * When a step finished: its StepTrace time, then row id (rows are written in completion order per worker). Creation
 * order is not execution order (a Sequential creates all its steps up front), so replay compares this.
 */
export type FinishOrder = [number, number];

export const finishedNoLater = (a: FinishOrder, b: FinishOrder): boolean => a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]);

export interface OriginalStep {
  requestId: number;
  /** Null when the step has no StepTrace row (not finished, or its row was retired). */
  finished: FinishOrder | null;
  path: string;
  status: string;
  nodeType: string | null;
  astHash: string | null;
  context: Record<string, any> | null;
  /** Control steps' result (`StepTrace.output`); a history step's result is its latest Response. */
  output: string | null;
}

export interface StepRow {
  requestId: number;
  createdBy: number | null;
  status: string;
  nodeType: string | null;
  astHash?: string | null;
  context?: any;
  output?: string | null;
  finished?: FinishOrder | null;
}

/**
 * Paths of every request under `rootId`: children are ordered by id (creation order) per creator. Returns the
 * steps by path and by request id.
 */
export function indexRun(rows: StepRow[], rootId: number): { byPath: Map<string, OriginalStep>; pathOf: Map<number, string> } {
  const byId = new Map(rows.map((r) => [r.requestId, r]));
  const children = new Map<number, number[]>();
  for (const r of rows) {
    if (r.createdBy == null || r.requestId === rootId) continue;
    const list = children.get(r.createdBy) ?? [];
    list.push(r.requestId);
    children.set(r.createdBy, list);
  }
  for (const list of children.values()) list.sort((a, b) => a - b);

  const byPath = new Map<string, OriginalStep>();
  const pathOf = new Map<number, string>();
  const queue: Array<[number, string]> = [[rootId, ROOT_PATH]];
  while (queue.length) {
    const [id, path] = queue.shift()!;
    pathOf.set(id, path);
    const row = byId.get(id);
    if (row) {
      byPath.set(path, {
        requestId: id,
        path,
        finished: row.finished ?? null,
        status: row.status,
        nodeType: row.nodeType,
        astHash: row.astHash ?? null,
        context: row.context ?? null,
        output: row.output ?? null,
      });
    }
    (children.get(id) ?? []).forEach((child, k) => queue.push([child, `${path}.${k}`]));
  }
  return { byPath, pathOf };
}

/** The topmost ancestor of `requestId` by `createdBy` (the run's root), or null when the chain is broken. */
export function rootOf(rows: StepRow[], requestId: number): number | null {
  const byId = new Map(rows.map((r) => [r.requestId, r]));
  let id = requestId;
  for (let hops = 0; hops < 100_000; hops++) {
    const row = byId.get(id);
    if (!row) return null;
    if (row.createdBy == null) return id;
    id = row.createdBy;
  }
  return null;
}

export type ReplayDecision =
  | { action: 'replay'; original: OriginalStep; boundary: boolean }
  | { action: 'live' }
  | { action: 'diverge'; reason: string };

/** What a fork does with its step at `path` running `node`. */
export function decideReplay(
  spec: ForkSpec,
  original: OriginalStep | undefined,
  node: { type: string },
  hash: string,
  boundaryPassed: boolean,
): ReplayDecision {
  if (!REPLAYABLE_NODE_TYPES.has(node.type)) return { action: 'live' };
  const versionChanged = spec.scriptVersion != null && spec.scriptVersion !== spec.originalScriptVersion;
  const terminal = original && ['COMPLETED', 'FAILED', 'SKIPPED', 'CANCELLED'].includes(original.status);
  const sameNode = !!original && original.astHash === hash;
  if (original && sameNode && terminal && original.finished && finishedNoLater(original.finished, spec.atFinished)) {
    return { action: 'replay', original, boundary: original.requestId === spec.atRequestId };
  }
  if (boundaryPassed) return { action: 'live' };
  if (!original) {
    return versionChanged ? { action: 'live' } : { action: 'diverge', reason: 'the original run has no step here' };
  }
  if (!sameNode) {
    return versionChanged ? { action: 'live' } : { action: 'diverge', reason: `the step differs from the original (request ${original.requestId})` };
  }
  // Same step, but still running in the original, or finished after the fork point: it runs again
  return { action: 'live' };
}

/** One state change of a conversation (a state event), as `conversation_state_history` lists it. */
export interface StateHistoryEntry {
  /** EventLog id of the state event: `stateAt(seq)` is the state right after it. */
  seq: number;
  kind: 'patch' | 'rewind';
  /** The step that wrote it (null: written outside a step). */
  requestId: number | null;
  nodeType: string | null;
  scope: string | null;
  keys: string[];
  /** A fork can start right after this step (a finished replayable step with recorded lineage). */
  forkable: boolean;
}

export interface ForkInput {
  conversationId: number;
  /** Fork right after this finished step... */
  atRequestId?: number;
  /** ...or after the step that wrote this state event. */
  atSeq?: number;
  /** Merged into state right after the fork point's step. */
  statePatch?: Record<string, any>;
  /** Run this version of the root's script instead of the original's. */
  scriptVersion?: number;
  userId: string;
  /** From the host session. */
  projectIds: string[];
}

export interface ForkResult {
  conversationId: number;
  rootRequestId: number;
  boundaryPath: string;
}

/** Processor API behind conversation_state_history / conversation_state_at / conversation_fork. */
export interface TimeTravelApi {
  history(conversationId: number, projectIds: string[]): Promise<StateHistoryEntry[]>;
  stateAt(conversationId: number, seq: number | undefined, projectIds: string[]): Promise<ConversationStateData>;
  fork(input: ForkInput): Promise<ForkResult>;
}

export const TimeTravelService = defineService<TimeTravelApi>('curator.timeTravel');
