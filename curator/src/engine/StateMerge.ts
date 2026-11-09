/**
 * Declared state merge rules (docs/ENGINE_EVOLUTION_PLAN.md, Phase D). A `stateSchema` on a `Curator_Module` (all
 * its writes) or a `Curator_Parallel` (its branches' writes, over the module's) says how a write to a key combines
 * with the value already there. Rules are applied when the write is appended, under the conversation's state lock,
 * and the event stores the resulting values, so folding, rewind and compaction stay plain merges.
 * Keys without a rule are replaced (the last write wins); a Join with `strict` fails when two of its branches
 * wrote the same such key.
 */
import { isDeepStrictEqual } from 'node:util';
import type { CuratorReducer } from './CuratorContracts.js';

export const MERGE_RULE_NAMES = ['replace', 'append', 'union', 'sum', 'max', 'min', 'deepMerge'] as const;
export type MergeRuleName = (typeof MERGE_RULE_NAMES)[number];
/** A built-in rule, or a plugin reducer called with `{ key, current, incoming }` that returns `{ value }`. */
export type CuratorMergeRule = MergeRuleName | { reducer: string };
export type CuratorStateSchema = Record<string, { merge: CuratorMergeRule }>;

/**
 * Context key marking a parallel branch: `{ join, name }` (the Join request and the branch's name). The parallel's
 * merge rules are on its Join's node (`fanIn.rules`).
 */
export const BRANCH_KEY = '__branch';

export type MergeRules = Record<string, CuratorMergeRule>;

/** Rules of a schema (only `merge` is read), later schemas winning. */
export function rulesOf(...schemas: Array<CuratorStateSchema | MergeRules | undefined | null>): MergeRules {
  const rules: MergeRules = {};
  for (const schema of schemas) {
    for (const [key, spec] of Object.entries(schema ?? {})) {
      const rule = spec && typeof spec === 'object' && 'merge' in spec ? (spec as any).merge : spec;
      if (rule != null) rules[key] = rule as CuratorMergeRule;
    }
  }
  return rules;
}

const asList = (v: unknown): unknown[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const isPlainObject = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

function deepMerge(a: unknown, b: unknown): unknown {
  if (!isPlainObject(a) || !isPlainObject(b)) return b;
  const out: Record<string, any> = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = k in out ? deepMerge(out[k], v) : v;
  return out;
}

const num = (v: unknown, key: string, rule: string): number => {
  if (typeof v !== 'number' || Number.isNaN(v)) throw new Error(`Merge rule '${rule}' for '${key}' needs numbers, got ${JSON.stringify(v)}`);
  return v;
};

/** The value of `key` after writing `incoming` over `current` with `rule`. */
export function mergeValue(
  key: string,
  current: unknown,
  incoming: unknown,
  rule: CuratorMergeRule,
  reducer?: (name: string) => CuratorReducer | undefined,
): unknown {
  if (typeof rule === 'object') {
    const fn = reducer?.(rule.reducer);
    if (!fn) throw new Error(`Merge reducer '${rule.reducer}' for '${key}' is not registered`);
    const out = fn({ key, current, incoming });
    if (!out || typeof out !== 'object' || !('value' in out)) throw new Error(`Merge reducer '${rule.reducer}' must return { value }`);
    return out.value;
  }
  switch (rule) {
    case 'replace': return incoming;
    case 'append': return [...asList(current), ...asList(incoming)];
    case 'union': {
      const out = [...asList(current)];
      for (const item of asList(incoming)) if (!out.some((x) => isDeepStrictEqual(x, item))) out.push(item);
      return out;
    }
    case 'sum': return current == null ? num(incoming, key, rule) : num(current, key, rule) + num(incoming, key, rule);
    case 'max': return current == null ? num(incoming, key, rule) : Math.max(num(current, key, rule), num(incoming, key, rule));
    case 'min': return current == null ? num(incoming, key, rule) : Math.min(num(current, key, rule), num(incoming, key, rule));
    case 'deepMerge': return deepMerge(current, incoming);
    default: throw new Error(`Unknown merge rule '${String(rule)}' for '${key}'`);
  }
}

/**
 * Applies `rules` to a write: returns the values to store (`set`) and the rule used per merged key (`merge`, absent
 * when no rule applied). `current` is the state the write lands on (the scope's bucket for a scoped write).
 */
export function applyMergeRules(
  current: Record<string, any>,
  incoming: Record<string, any>,
  rules: MergeRules | undefined,
  reducer?: (name: string) => CuratorReducer | undefined,
): { set: Record<string, any>; merge?: Record<string, string> } {
  if (!rules || Object.keys(rules).length === 0) return { set: incoming };
  const set: Record<string, any> = {};
  const merge: Record<string, string> = {};
  for (const [key, value] of Object.entries(incoming)) {
    const rule = rules[key];
    if (rule == null || rule === 'replace') {
      set[key] = value;
      continue;
    }
    set[key] = mergeValue(key, current?.[key], value, rule, reducer);
    merge[key] = typeof rule === 'object' ? `reducer:${rule.reducer}` : rule;
  }
  return Object.keys(merge).length ? { set, merge } : { set };
}

/** A state patch event as conflict detection reads it. */
export interface BranchWrite {
  branch: string;
  keys: string[];
}

/** Keys without a rule that two or more branches wrote: `{ key: [branch names] }`. */
export function branchConflicts(writes: BranchWrite[], rules: MergeRules): Record<string, string[]> {
  const writers = new Map<string, Set<string>>();
  for (const w of writes) {
    for (const key of w.keys) {
      if (rules[key] != null && rules[key] !== 'replace') continue;
      const set = writers.get(key) ?? new Set<string>();
      set.add(w.branch);
      writers.set(key, set);
    }
  }
  const out: Record<string, string[]> = {};
  for (const [key, branches] of writers) if (branches.size > 1) out[key] = [...branches].sort();
  return out;
}

/** JSON Schema of `stateSchema` (AST validation). */
export const STATE_SCHEMA_JSON = {
  type: 'object',
  additionalProperties: {
    type: 'object',
    properties: {
      merge: {
        anyOf: [
          { enum: [...MERGE_RULE_NAMES] },
          { type: 'object', properties: { reducer: { type: 'string', minLength: 1 } }, required: ['reducer'], additionalProperties: false },
        ],
      },
    },
    required: ['merge'],
    additionalProperties: false,
  },
} as const;
