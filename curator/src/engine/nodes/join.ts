import type { NodeHandler } from './NodeHandler.js';
import type { CuratorJoinNode } from '../CuratorAst.js';
import { logger } from '../../utils/logger.js';
import { BRANCH_KEY, branchConflicts, rulesOf, MERGE_RULES_KEY, type BranchWrite } from '../StateMerge.js';
import { JOIN_BRANCHES_KEY, JOIN_SINCE_KEY, JOIN_SPEC_KEY } from './parallel.js';

/** Join context flags set when the branches were closed early. */
export const JOIN_TIMED_OUT_KEY = '__joinTimedOut';
export const JOIN_FAIL_FAST_KEY = '__joinFailFast';

const parseMaybe = (v: string | null): any => {
  if (v == null) return null;
  try { return JSON.parse(v); } catch { return v; }
};

/**
 * Curator_Join: runs once every branch of its parallel has arrived (or the branches were closed early). It decides
 * the outcome by the parallel's `join.requires`, fails on state keys two branches wrote without a merge rule
 * (`strict`), merges isolated branches' scopes back (`mergeBack`), and records each branch's status and output
 * under `join.as`. Its own result stays the branches' joined text.
 */
export const joinNode: NodeHandler<CuratorJoinNode> = {
  type: 'Curator_Join',
  async run(ast, req, ctx) {
    logger.debug(`[CuratorRequestProcessor] Executing Join Node for request ${req.id}`);
    const jctx = ctx.parseContext(req.context);
    const spec = jctx[JOIN_SPEC_KEY] ?? {};
    const declared: string[] = jctx[JOIN_BRANCHES_KEY] ?? [];

    const arrived = await ctx.store.requests.find({ notifyId: req.id });
    const responses = await ctx.store.responses.latestFor(arrived.filter((c) => c.output == null).map((c) => c.id));
    const outputOf = (c: any): string | null => c.output ?? responses.get(c.id)?.content ?? null;

    // Each branch's outcome (its last step notified us); branches that never arrived were closed early
    const branches: Record<string, { status: string; output: any }> = {};
    for (const c of arrived) {
      const name = ctx.parseContext(c.context)[BRANCH_KEY]?.name ?? `request${c.id}`;
      const status = c.status === 'CANCELLED' && jctx[JOIN_TIMED_OUT_KEY] ? 'TIMEOUT' : c.status;
      branches[name] = { status, output: parseMaybe(outputOf(c)) };
    }
    for (const name of declared) branches[name] ??= { status: jctx[JOIN_TIMED_OUT_KEY] ? 'TIMEOUT' : 'CANCELLED', output: null };

    const completed = arrived.filter((c) => c.status === 'COMPLETED');
    const fail = async (reason: string) => {
      await ctx.saveResponse(req, `ERROR: ${reason}`);
      await ctx.completeRequest(req.id, 'FAILED', false, spec.as ? { context: { ...jctx, [spec.as]: branches } } : undefined);
    };

    // 1. Enough branches succeeded?
    const total = declared.length || arrived.length;
    const need = spec.requires === 'all' ? total : typeof spec.requires === 'object' && spec.requires ? Number(spec.requires.min) : 1;
    if (jctx[JOIN_FAIL_FAST_KEY]) return fail(`a parallel branch failed (fail_fast): ${summary(branches)}`);
    if (completed.length === 0) return fail('all parallel branches failed');
    if (completed.length < need) return fail(`${completed.length} of ${total} parallel branches succeeded, ${need} required: ${summary(branches)}`);

    // 2. No key written by two branches without a merge rule
    const rules = rulesOf(await ctx.mergeRules?.(req), spec.rules);
    const strict = spec.strict ?? Object.keys(rules).length > 0;
    let writes: BranchWrite[] = [];
    let buckets: Array<[string, Record<string, any>]> = [];
    if (spec.isolate) {
      if (spec.mergeBack) {
        const scopes = await rawScopes(ctx, req.conversationId);
        buckets = declared.filter((name) => branches[name]?.status === 'COMPLETED').map((name) => [name, scopes[name] ?? {}]);
        writes = buckets.map(([branch, bucket]) => ({ branch, keys: Object.keys(bucket) }));
      }
    } else if (ctx.prisma.eventLog?.findMany) {
      const events = await ctx.prisma.eventLog.findMany({
        where: { conversationId: req.conversationId, eventName: '__state.patch', id: { gt: Number(jctx[JOIN_SINCE_KEY] ?? 0) } },
        orderBy: { id: 'asc' },
      });
      writes = events
        .filter((e: any) => e.payload?.branch?.join === req.id && e.payload?.scope == null)
        .map((e: any) => ({ branch: e.payload.branch.name, keys: Object.keys(e.payload.set ?? {}) }));
    }
    const conflicts = branchConflicts(writes, rules);
    if (Object.keys(conflicts).length) {
      const text = Object.entries(conflicts).map(([key, names]) => `'${key}' (${names.join(', ')})`).join('; ');
      if (strict) return fail(`parallel branches wrote the same state keys without a merge rule: ${text}. Declare them in stateSchema or set strict: false`);
      logger.warn(`[CuratorRequestProcessor] Join ${req.id}: branches wrote the same state keys without a merge rule (last write wins): ${text}. Declare them in stateSchema; this becomes an error in a later release.`);
    }

    // 3. Isolated branches merged back into shared state, in branch order, through the rules
    if (buckets.length) {
      req.context = { ...jctx, [MERGE_RULES_KEY]: rules };
      for (const [, bucket] of buckets) if (Object.keys(bucket).length) await ctx.writeState(req.conversationId, null, bucket);
      req.context = jctx;
    }

    // 4. The branches' outcomes under `as`
    const nextCtx: Record<string, any> = { ...jctx };
    if (spec.as) {
      nextCtx[spec.as] = branches;
      await ctx.writeState(req.conversationId, jctx.__scope ?? null, { [spec.as]: branches });
    }
    const combinedTexts = completed.map((c) => outputOf(c) ?? '').join('\n\n---\n\n');
    await ctx.saveResponse(req, `[Joined Output]\n${combinedTexts}`);
    await ctx.completeRequest(req.id, 'COMPLETED', false, spec.as ? { context: nextCtx } : undefined);
  },
};

const summary = (branches: Record<string, { status: string }>) =>
  Object.entries(branches).map(([name, b]) => `${name}=${b.status}`).join(', ');

/** The private scope buckets of a conversation's state. */
async function rawScopes(ctx: any, conversationId: number): Promise<Record<string, Record<string, any>>> {
  const conv = await ctx.prisma.conversation.findUnique({ where: { id: conversationId } });
  return ctx.getConversationState(conv).__scopes ?? {};
}
