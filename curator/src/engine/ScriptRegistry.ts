import { createHash } from 'node:crypto';
import type { CuratorAstNode, CuratorModuleNode } from './CuratorAst.js';
import { parseCuratorRef, validateCuratorAst } from './CuratorAstValidation.js';

/**
 * ScriptRegistry — versioned Script storage, subroutine ref resolution and
 * subscription materialization.
 *
 *  - Script         : stable identity (name), `currentVersion` pointer.
 *  - ScriptVersion  : immutable AST per content hash; created only when the hash changes.
 *  - EventSubscription : derived from `Curator_Module.subscriptions`; the AST stays the source of truth.
 */

export type ScriptDriftPolicy = 'update' | 'keep' | 'error';

export interface SaveScriptVersionInput {
  name: string;
  ast: CuratorAstNode;
  body?: string | null;
  userId?: string | null;
  projectId?: string | null;
  createdBy?: string | null;
  /**
   * What to do when the script exists and the AST differs from the current version:
   *  - update (default): create/activate the new version
   *  - keep: leave currentVersion unchanged (runtime-owned definitions win)
   *  - error: throw
   */
  onDrift?: ScriptDriftPolicy;
}

export interface SaveScriptVersionResult {
  scriptId: number;
  version: number;
  hash: string;
  /** A new ScriptVersion row was inserted. */
  created: boolean;
  /** Code AST differs from the active version but onDrift='keep' left it unchanged. */
  drift: boolean;
}

export interface ResolvedRef {
  scriptId: number;
  scriptName: string;
  version: number;
  /** Subroutine name; undefined = main / plain root. */
  entry?: string;
  /** Executable node for this entry. */
  node: CuratorAstNode;
  /** Declared params of the entry (module params for main). */
  params?: Record<string, any>;
  /** Result expression of the subroutine, if declared. */
  returns?: string;
}

/** Deterministic JSON (sorted keys) so equal ASTs hash equally. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function hashAst(ast: unknown): string {
  return createHash('sha256').update(stableStringify(ast)).digest('hex');
}

function parseJson<T = any>(value: unknown): T {
  return (typeof value === 'string' ? JSON.parse(value) : value) as T;
}

// Versions are immutable, so the cache never needs invalidation.
const versionCache = new Map<string, CuratorAstNode>();

/** Loads the AST of a specific (or the current) version of a script. */
export async function getScriptVersionAst(
  prisma: any,
  scriptId: number,
  version?: number
): Promise<{ version: number; ast: CuratorAstNode }> {
  let v = version;
  if (v === undefined) {
    const script = await prisma.script.findUnique({ where: { id: scriptId }, select: { currentVersion: true } });
    if (!script) throw new Error(`Script #${scriptId} not found`);
    v = script.currentVersion;
  }
  const key = `${scriptId}:${v}`;
  const cached = versionCache.get(key);
  if (cached) return { version: v!, ast: cached };

  const row = await prisma.scriptVersion.findUnique({ where: { scriptId_version: { scriptId, version: v } } });
  if (!row?.ast) throw new Error(`ScriptVersion ${scriptId}@${v} not found`);
  const ast = parseJson<CuratorAstNode>(row.ast);
  versionCache.set(key, ast);
  return { version: v!, ast };
}

/** Returns the executable node, params and returns-expression for an entry of a script AST. */
export function getEntry(
  ast: CuratorAstNode,
  entry?: string
): { node: CuratorAstNode; params?: Record<string, any>; returns?: string } {
  if (ast.type !== 'Curator_Module') {
    if (entry) throw new Error(`Script is not a module; cannot resolve entry '#${entry}'`);
    return { node: ast };
  }
  const mod = ast as CuratorModuleNode;
  if (!entry) {
    if (!mod.main) throw new Error(`Module '${mod.name}' has no main`);
    return { node: mod.main, params: mod.params };
  }
  const sub = mod.subroutines?.[entry];
  if (!sub) throw new Error(`Module '${mod.name}' has no subroutine '${entry}'`);
  return { node: sub.body, params: sub.params, returns: sub.returns };
}

/**
 * Resolves 'script', 'script#sub' or '#sub'.
 * Local refs resolve against the caller's script at the caller's version (consistent snapshot);
 * cross-script refs resolve to the target's current version.
 */
export async function resolveRef(
  prisma: any,
  ref: string,
  caller?: { scriptId?: number | null; scriptVersion?: number | null }
): Promise<ResolvedRef> {
  const parsed = parseCuratorRef(ref);
  if (!parsed) throw new Error(`Invalid ref '${ref}'`);

  let scriptId: number;
  let scriptName: string;
  let version: number | undefined;

  if (!parsed.script) {
    if (!caller?.scriptId) throw new Error(`Local ref '${ref}' used outside a stored script`);
    const script = await prisma.script.findUnique({ where: { id: caller.scriptId }, select: { id: true, name: true } });
    if (!script) throw new Error(`Caller script #${caller.scriptId} not found`);
    scriptId = script.id;
    scriptName = script.name;
    version = caller.scriptVersion ?? undefined;
  } else {
    const script = await prisma.script.findUnique({ where: { name: parsed.script }, select: { id: true, name: true } });
    if (!script) throw new Error(`Script '${parsed.script}' not found`);
    scriptId = script.id;
    scriptName = script.name;
  }

  const loaded = await getScriptVersionAst(prisma, scriptId, version);
  const { node, params, returns } = getEntry(loaded.ast, parsed.entry);
  return { scriptId, scriptName, version: loaded.version, entry: parsed.entry, node, params, returns };
}

/**
 * Saves a script definition as an immutable version (only when the AST hash changes),
 * updates the currentVersion pointer per drift policy, and materializes static subscriptions.
 */
export async function saveScriptVersion(prisma: any, input: SaveScriptVersionInput): Promise<SaveScriptVersionResult> {
  const validation = validateCuratorAst(input.ast);
  if (!validation.valid) throw new Error(`Script '${input.name}' has an invalid AST: ${validation.errors.join('; ')}`);
  const ast = validation.node!;
  const hash = hashAst(ast);
  const onDrift = input.onDrift ?? 'update';

  let script = await prisma.script.findUnique({ where: { name: input.name } });
  if (!script) {
    script = await prisma.script.create({
      data: { name: input.name, body: input.body ?? null, userId: input.userId ?? null, projectId: input.projectId ?? null, currentVersion: 0 },
    });
  }

  const existing = await prisma.scriptVersion.findUnique({ where: { scriptId_hash: { scriptId: script.id, hash } } });
  const isCurrent = existing && existing.version === script.currentVersion;
  if (isCurrent) {
    return { scriptId: script.id, version: existing.version, hash, created: false, drift: false };
  }

  const hasActive = script.currentVersion > 0;
  if (hasActive && onDrift === 'keep') {
    return { scriptId: script.id, version: script.currentVersion, hash, created: false, drift: true };
  }
  if (hasActive && onDrift === 'error') {
    throw new Error(`Script '${input.name}' differs from active version ${script.currentVersion} (onDrift=error)`);
  }

  let version: number;
  let created = false;
  if (existing) {
    // Re-activating a previously stored version (e.g. rollback to an older code definition).
    version = existing.version;
  } else {
    const latest = await prisma.scriptVersion.findFirst({ where: { scriptId: script.id }, orderBy: { version: 'desc' }, select: { version: true } });
    version = (latest?.version ?? 0) + 1;
    await prisma.scriptVersion.create({
      data: { scriptId: script.id, version, hash, ast: ast as any, body: input.body ?? null, createdBy: input.createdBy ?? input.userId ?? null },
    });
    created = true;
  }

  // Script.ast/body mirror the active version for backward compatibility with existing readers.
  await prisma.script.update({
    where: { id: script.id },
    data: { currentVersion: version, ast: ast as any, body: input.body ?? script.body },
  });
  versionCache.set(`${script.id}:${version}`, ast);

  await syncScriptSubscriptions(prisma, { id: script.id, userId: script.userId, projectId: script.projectId }, ast);
  return { scriptId: script.id, version, hash, created, drift: false };
}

/**
 * Materializes `Curator_Module.subscriptions` into EventSubscription rows (static, conversationId = null).
 * Declarations that disappeared are deactivated. Static handlers must belong to the declaring script
 * ('#sub' or the script's own name), so each row is owned by exactly one declaration.
 */
export async function syncScriptSubscriptions(
  prisma: any,
  script: { id: number; userId?: string | null; projectId?: string | null },
  ast: CuratorAstNode
): Promise<{ active: number; deactivated: number }> {
  if (!prisma.eventSubscription) return { active: 0, deactivated: 0 };
  const scriptRow = await prisma.script.findUnique({ where: { id: script.id }, select: { name: true } });
  const declarations = ast.type === 'Curator_Module' ? (ast as CuratorModuleNode).subscriptions || [] : [];

  const keep = new Set<number>();
  for (const decl of declarations) {
    const parsed = parseCuratorRef(decl.handler);
    if (!parsed) throw new Error(`Invalid subscription handler '${decl.handler}'`);
    if (parsed.script && parsed.script !== scriptRow?.name) {
      throw new Error(`Static subscription handler '${decl.handler}' must belong to the declaring script '${scriptRow?.name}'`);
    }
    const entry = parsed.entry ?? null;
    const where = { scriptId: script.id, entry, eventName: decl.eventName, conversationId: null };
    const data = { isActive: true, when: decl.when ?? null, payloadAs: decl.as ?? null, userId: script.userId ?? 'system', projectId: script.projectId ?? null };
    const found = await prisma.eventSubscription.findFirst({ where });
    const row = found
      ? await prisma.eventSubscription.update({ where: { id: found.id }, data })
      : await prisma.eventSubscription.create({ data: { ...where, ...data } });
    keep.add(row.id);
  }

  const stale = await prisma.eventSubscription.updateMany({
    where: { scriptId: script.id, conversationId: null, isActive: true, id: { notIn: [...keep] } },
    data: { isActive: false },
  });
  return { active: keep.size, deactivated: stale?.count ?? 0 };
}

// ---------------------------------------------------------------------------
// Reference mode: Requests address a node by scriptId + scriptVersion + astPath
// ---------------------------------------------------------------------------

/** astPath of an entry: '' for a plain root, 'main' or 'subroutines.<name>.body' for modules. */
export function entryAstPath(ast: CuratorAstNode, entry?: string | null): string {
  if (ast.type !== 'Curator_Module') return '';
  return entry ? `subroutines.${entry}.body` : 'main';
}

/** Returns the node at a dot path ('' = root). Throws when the path does not resolve to a node. */
export function getNodeAtPath(ast: CuratorAstNode, astPath?: string | null): CuratorAstNode {
  if (!astPath) return ast;
  let cur: any = ast;
  for (const seg of astPath.split('.')) {
    cur = cur?.[seg];
    if (cur === undefined) break;
  }
  if (!cur || typeof cur !== 'object' || typeof cur.type !== 'string') {
    throw new Error(`astPath '${astPath}' does not resolve to a node`);
  }
  return cur as CuratorAstNode;
}

/**
 * Loads the executable node of a Request. Snapshot (`req.ast`) wins; otherwise the node is read from
 * ScriptVersion via `context.astPath`. A module root executes its `main`. Inline calls are expanded.
 */
export async function resolveRequestNode(
  prisma: any,
  req: { ast?: any; scriptId?: number | null; scriptVersion?: number | null; context?: any }
): Promise<{ node: CuratorAstNode | null; module?: CuratorModuleNode; version?: number }> {
  const ctx = parseJson<any>(req.context) || {};
  let module: CuratorModuleNode | undefined;
  let version: number | undefined;
  let node: CuratorAstNode | null = null;

  if (req.ast) {
    node = parseJson<CuratorAstNode>(req.ast);
  } else if (req.scriptId) {
    const loaded = await getScriptVersionAst(prisma, req.scriptId, req.scriptVersion ?? undefined);
    version = loaded.version;
    if (loaded.ast.type === 'Curator_Module') module = loaded.ast as CuratorModuleNode;
    node = getNodeAtPath(loaded.ast, ctx.astPath);
  }
  if (!node) return { node: null };

  if (node.type === 'Curator_Module') {
    module = node as CuratorModuleNode;
    node = getEntry(node).node;
  }
  if (module) node = expandInlineCalls(node, module);
  return { node, module, version };
}

/** Replaces `$params.<name>` in string fields with the bound argument expression. */
function bindInlineParams(value: any, args: Record<string, any>): any {
  if (typeof value === 'string') {
    return value.replace(/\$params\.([A-Za-z_][\w]*)/g, (m, name) => {
      if (!(name in args)) return m;
      const arg = args[name];
      return typeof arg === 'string' ? `(${arg})` : JSON.stringify(arg);
    });
  }
  if (Array.isArray(value)) return value.map((v) => bindInlineParams(v, args));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, bindInlineParams(v, args)]));
  }
  return value;
}

/**
 * Macro-expands `Curator_Call { mode: 'inline', ref: '#sub' }` into the subroutine body (params bound textually,
 * defaults applied). When `as` and `returns` are set, an Assign of the result is appended.
 * Validation already guarantees inline refs are local, acyclic and side-effect restricted.
 */
export function expandInlineCalls(node: CuratorAstNode, module: CuratorModuleNode, depth = 0): CuratorAstNode {
  if (depth > 32) throw new Error('Inline expansion too deep (cycle?)');
  const walk = (value: any): any => {
    if (Array.isArray(value)) return value.map(walk);
    if (!value || typeof value !== 'object') return value;
    if (value.type === 'Curator_Call' && value.mode === 'inline') {
      const parsed = parseCuratorRef(value.ref);
      const sub = parsed?.entry ? module.subroutines?.[parsed.entry] : undefined;
      if (!sub || parsed?.script) throw new Error(`Inline call '${value.ref}' must reference a local subroutine`);
      const args: Record<string, any> = {};
      for (const [name, spec] of Object.entries(sub.params || {})) {
        if (value.args && name in value.args) args[name] = value.args[name];
        else if (spec?.default !== undefined) args[name] = spec.default;
        else if (spec?.required) throw new Error(`Inline call '${value.ref}' is missing required param '${name}'`);
      }
      for (const [k, v] of Object.entries(value.args || {})) if (!(k in args)) args[k] = v;
      const body = expandInlineCalls(bindInlineParams(sub.body, args), module, depth + 1);
      if (!value.as || !sub.returns) return body;
      return {
        type: 'Curator_Sequential',
        name: `inline_${parsed!.entry}`,
        subAgents: [body, { type: 'Curator_Assign', key: value.as, expression: bindInlineParams(sub.returns, args) }],
      };
    }
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v)]));
  };
  return walk(node) as CuratorAstNode;
}

/**
 * Registers an ad-hoc AST (no Script) as an anonymous script `adhoc_<hash8>` so every Request
 * references a ScriptVersion. Identical ASTs share one script/version.
 */
export async function saveAdhocScript(
  prisma: any,
  ast: CuratorAstNode,
  owner: { userId?: string | null; projectId?: string | null }
): Promise<SaveScriptVersionResult & { name: string }> {
  const name = `adhoc_${hashAst(ast).slice(0, 8)}`;
  // onDrift 'keep': on the (unlikely) 8-char prefix collision we never overwrite a different AST.
  const res = await saveScriptVersion(prisma, { name, ast, userId: owner.userId, projectId: owner.projectId, onDrift: 'keep' });
  if (res.drift) throw new Error(`Ad-hoc script name collision for '${name}'`);
  return { ...res, name };
}
