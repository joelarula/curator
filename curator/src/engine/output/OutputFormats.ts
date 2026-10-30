import { logger } from '../../utils/logger.js';

/** Who reads a formatted value: the model (tool message) or a person (REPL / UI). */
export type OutputTarget = 'llm' | 'display';

export interface FormatContext {
  target: OutputTarget;
  /** Registered tool key. */
  toolKey?: string;
  /** Name the tool was offered or called by (e.g. `mcp.blueprint.web_scrape`). */
  toolName?: string;
  agentName?: string;
}

/** One pipeline step: `value` is the previous step's output, `arg` the step's argument (`name:arg` or `{ use, args }`). */
export type CuratorFormatter = (value: unknown, arg: unknown, ctx: FormatContext) => unknown;

/** `'name'`, `'name:arg'` or `{ use: 'name', args }`. */
export type FormatStep = string | { use: string; args?: unknown };
/** A step or a pipeline of steps, applied left to right. */
export type FormatSpec = FormatStep | FormatStep[];

/** How a tool's result is formatted per target. */
export interface ToolOutputSpec {
  llm?: FormatSpec;
  display?: FormatSpec;
}

/** Tool name or `*` pattern → output spec. */
export type ToolOutputRules = Record<string, ToolOutputSpec>;

export interface ToolResultFormatOptions {
  target: OutputTarget;
  /** Names the tool is known by (offered alias, registered key); rules match any of them. */
  names: string[];
  /** The tool; its own `output` spec is the fallback. */
  tool?: { output?: ToolOutputSpec };
  /** Agent-level rules (`Curator_Agent.tool_output`), checked first. */
  agentRules?: ToolOutputRules;
  agentName?: string;
}

function globToRegExp(pattern: string): RegExp {
  return new RegExp(`^${pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const asText = (v: unknown): string => (typeof v === 'string' ? v : v === undefined ? '' : JSON.stringify(v));
const getPath = (v: unknown, path: string): unknown =>
  path.split('.').reduce<any>((o, k) => (o == null ? undefined : o[k]), v);
const argList = (arg: unknown): string[] =>
  Array.isArray(arg) ? arg.map(String) : typeof arg === 'string' ? arg.split(',').map((s) => s.trim()).filter(Boolean) : [];
const mapStrings = (v: unknown, fn: (s: string) => string): unknown =>
  typeof v === 'string'
    ? fn(v)
    : isPlainObject(v)
      ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'string' ? fn(x) : x]))
      : v;

/** `[label](url "title")` (escapes allowed in label, url and title); images first, they become nothing. */
const MD_IMAGE = /!\[(?:\\.|[^\]\\\n])*\]\((?:\\.|[^()\\\s]|\([^()\s]*\))*(?:\s+"(?:\\.|[^"\\])*")?\)/g;
const MD_LINK = /\[((?:\\.|[^\]\\\n])*)\]\((?:\\.|[^()\\\s]|\([^()\s]*\))*(?:\s+"(?:\\.|[^"\\])*")?\)/g;

/** Built-in formatters; plugins may add more or replace these by name. */
export const BUILTIN_FORMATTERS: Record<string, CuratorFormatter> = {
  /** JSON text (strings stay as they are); `json:2` indents. */
  json: (v, arg) => (typeof v === 'string' ? v : JSON.stringify(v, null, arg ? Number(arg) : undefined)),
  /** Plain text: MCP text parts joined, an object's string fields joined, else JSON. */
  text: (v) => {
    if (typeof v === 'string') return v;
    const content = isPlainObject(v) && Array.isArray(v.content) ? v.content : undefined;
    if (content) return content.filter((c: any) => c?.type === 'text').map((c: any) => c.text).join('\n');
    if (isPlainObject(v)) {
      const texts = Object.values(v).filter((x): x is string => typeof x === 'string');
      if (texts.length) return texts.join('\n\n');
    }
    return asText(v);
  },
  /** Only the named top-level fields: `pick:title,markdown`. */
  pick: (v, arg) => (isPlainObject(v) ? Object.fromEntries(argList(arg).filter((k) => k in v).map((k) => [k, v[k]])) : v),
  /** One value by (dotted) path: `field:markdown`. */
  field: (v, arg) => getPath(v, String(arg ?? '')),
  /** At most n characters of the text form: `truncate:12000`. */
  truncate: (v, arg) => {
    const text = asText(v);
    const max = Number(arg);
    return max > 0 && text.length > max ? `${text.slice(0, max)}\n… [truncated ${text.length - max} chars]` : text;
  },
  /** Markdown links become their label, images are dropped (in a string or an object's string fields). */
  'strip-links': (v) => mapStrings(v, (s) => s.replace(MD_IMAGE, '').replace(MD_LINK, '$1')),
  /** `{path}` placeholders filled from the value: `template:{title} ({length} chars)`. */
  template: (v, arg) => String(arg ?? '').replace(/\{([^{}]+)\}/g, (_, p: string) => asText(getPath(v, p.trim()))),
};

/**
 * Formatter registry and tool output rules (plugins: `formatters`, `toolOutput`; tools: `output`).
 * A tool result's spec is the first of: agent rules, registered rules (latest registration wins), the tool's own `output`.
 * Without a spec, `llm` gets the text/JSON form and `display` gets nothing.
 */
export class OutputFormats {
  private readonly formatters = new Map<string, CuratorFormatter>(Object.entries(BUILTIN_FORMATTERS));
  private rules: { match: RegExp; spec: ToolOutputSpec }[] = [];

  registerFormatter(name: string, formatter: CuratorFormatter): void {
    this.formatters.set(name, formatter);
  }

  hasFormatter(name: string): boolean {
    return this.formatters.has(name);
  }

  /** Rules for tools matching `pattern` (`*` wildcards). Returns the unregister function. */
  registerToolOutput(pattern: string, spec: ToolOutputSpec): () => void {
    const rule = { match: globToRegExp(pattern), spec };
    this.rules.unshift(rule);
    return () => {
      this.rules = this.rules.filter((r) => r !== rule);
    };
  }

  registerToolOutputs(rules: ToolOutputRules): () => void {
    const off = Object.entries(rules).map(([pattern, spec]) => this.registerToolOutput(pattern, spec));
    return () => off.forEach((f) => f());
  }

  resolve(opts: ToolResultFormatOptions): FormatSpec | undefined {
    const names = opts.names.filter(Boolean);
    for (const [pattern, spec] of Object.entries(opts.agentRules ?? {})) {
      const match = globToRegExp(pattern);
      if (spec?.[opts.target] !== undefined && names.some((n) => match.test(n))) return spec[opts.target];
    }
    for (const rule of this.rules) {
      if (rule.spec[opts.target] !== undefined && names.some((n) => rule.match.test(n))) return rule.spec[opts.target];
    }
    return opts.tool?.output?.[opts.target];
  }

  /** Runs the pipeline; unknown formatters throw. */
  apply(value: unknown, spec: FormatSpec | undefined, ctx: FormatContext): unknown {
    if (spec === undefined) return value;
    const steps = Array.isArray(spec) ? spec : [spec];
    return steps.reduce((v, step) => {
      const [name, arg] = typeof step === 'string' ? splitStep(step) : [step.use, step.args];
      const formatter = this.formatters.get(name);
      if (!formatter) throw new Error(`Unknown output formatter '${name}'`);
      return formatter(v, arg, ctx);
    }, value);
  }

  /** Text form of `value` after `spec` (strings as they are, anything else as JSON). */
  format(value: unknown, spec: FormatSpec | undefined, ctx: FormatContext): string {
    return asText(this.apply(value, spec, ctx));
  }

  /**
   * A tool result for `target`, or undefined when no spec applies (callers keep their default form).
   * A failing formatter is logged and yields undefined, so a bad rule never fails the tool call.
   */
  formatToolResult(value: unknown, opts: ToolResultFormatOptions): string | undefined {
    const spec = this.resolve(opts);
    if (spec === undefined) return undefined;
    try {
      return this.format(value, spec, { target: opts.target, toolName: opts.names[0], toolKey: opts.names.at(-1), agentName: opts.agentName });
    } catch (err: any) {
      logger.warn(`[OutputFormats] ${opts.target} format of '${opts.names[0]}' failed: ${err?.message || err}`);
      return undefined;
    }
  }
}

function splitStep(step: string): [string, string | undefined] {
  const i = step.indexOf(':');
  return i < 0 ? [step, undefined] : [step.slice(0, i), step.slice(i + 1)];
}

/** Used by processors whose engine has no registry of its own. */
export const defaultOutputFormats = new OutputFormats();
