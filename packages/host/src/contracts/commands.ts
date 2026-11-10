/**
 * One command vocabulary for the CLI shell and the web composer: `/name args` runs a command, tool or choice;
 * `@agent message` addresses an agent. Parsing, suggestions and tool-argument coercion are shared; pure and
 * browser-safe (the CLI re-exports `toolArgsFromTokens` / `toolUsage` from here).
 */

/** An entry of the command list (tool-contract shaped, plus where it comes from). */
export interface CommandDescriptor {
  name: string;
  source: 'command' | 'tool' | 'choice' | 'agent';
  title?: string;
  description?: string;
  aliases?: readonly string[];
  usage?: string;
  /** JSON Schema of a tool's arguments. */
  parameters?: unknown;
  /** Material Design icon for menus. */
  icon?: string;
  /** Choice value / agent name the entry stands for, when it differs from `name`. */
  value?: unknown;
}

/** Words of a command line; double or single quotes keep spaces together. */
export function parseCommandLine(text: string): string[] {
  const matches = text.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g);
  if (!matches) return [];
  return matches.map((token) =>
    (token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'")) ? token.slice(1, -1) : token
  );
}

/** Positional parameters of a tool schema: required first, then optional, each in declaration order. */
export function positionalParams(schema: any): { name: string; type?: string; required: boolean }[] {
  const props = schema?.properties && typeof schema.properties === 'object' ? schema.properties : {};
  const required = new Set<string>(Array.isArray(schema?.required) ? schema.required : []);
  const all = Object.keys(props).map((name) => ({ name, type: props[name]?.type, required: required.has(name) }));
  return [...all.filter((p) => p.required), ...all.filter((p) => !p.required)];
}

/** Command usage of a tool: its own `usage`, else `<required> [optional]` from its schema. */
export function toolUsage(tool: { usage?: string; parameters?: any }): string {
  if (tool.usage) return tool.usage;
  return positionalParams(tool.parameters)
    .map((p) => (p.required ? `<${p.name}>` : `[${p.name}]`))
    .join(' ');
}

function coerce(value: string, type?: string): any {
  if (type === 'number' || type === 'integer') {
    const n = Number(value);
    return Number.isNaN(n) ? value : n;
  }
  if (type === 'boolean') return value === 'true' ? true : value === 'false' ? false : value;
  if (type === 'object' || type === 'array') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

/**
 * Tool arguments from command tokens: a JSON object (`{...}`), else positional by the schema
 * (extra words join into the last string parameter), else `{ input }` for schema-less tools.
 */
export function toolArgsFromTokens(tokens: string[], schema: any): Record<string, any> {
  const raw = tokens.join(' ').trim();
  if (!raw) return {};
  if (raw.startsWith('{')) {
    try {
      return JSON.parse(raw);
    } catch {
      try {
        return JSON.parse(raw.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":'));
      } catch {}
    }
  }
  const params = positionalParams(schema);
  if (params.length === 0) return { input: raw };
  const args: Record<string, any> = {};
  params.forEach((p, i) => {
    if (i >= tokens.length) return;
    const isLast = i === params.length - 1;
    const value = isLast && (!p.type || p.type === 'string') ? tokens.slice(i).join(' ') : tokens[i];
    args[p.name] = coerce(value, p.type);
  });
  return args;
}

/** Required tool arguments missing from `args` (a client then asks for them, e.g. with a generated form). */
export function missingToolArgs(schema: any, args: Record<string, unknown>): string[] {
  return positionalParams(schema).filter((p) => p.required && args[p.name] === undefined).map((p) => p.name);
}

const SLASH_SOURCES = new Set(['command', 'tool', 'choice']);

function names(entry: CommandDescriptor): string[] {
  return [entry.name, ...(entry.aliases ?? [])].map((n) => n.toLowerCase());
}

/** The entry `name` refers to (name or alias, case-insensitive); commands win over tools, tools over choices. */
export function findCommand(catalog: readonly CommandDescriptor[], name: string, sources: ReadonlySet<string> = SLASH_SOURCES): CommandDescriptor | undefined {
  const n = name.toLowerCase();
  for (const source of ['command', 'tool', 'choice', 'agent']) {
    if (!sources.has(source)) continue;
    const hit = catalog.find((e) => e.source === source && names(e).includes(n));
    if (hit) return hit;
  }
  return undefined;
}

/** A trigger being typed at the cursor: `/` at the start of the input, `@` at the start of a word. */
export interface ComposerTrigger {
  trigger: '/' | '@';
  query: string;
  /** Range of the trigger and its word in the text (replace it when a suggestion is picked). */
  start: number;
  end: number;
}

export function findComposerTrigger(text: string, cursor: number = text.length): ComposerTrigger | null {
  const before = text.slice(0, cursor);
  const slash = /^\s*\/([^\s]*)$/.exec(before);
  if (slash) return { trigger: '/', query: slash[1], start: before.indexOf('/'), end: cursor };
  const at = /(^|\s)@([^\s@]*)$/.exec(before);
  if (at) {
    const start = cursor - at[2].length - 1;
    return { trigger: '@', query: at[2], start, end: cursor };
  }
  return null;
}

/** Suggestions for a trigger: names (and aliases) starting with the query first, then containing it. */
export function matchCommands(catalog: readonly CommandDescriptor[], trigger: '/' | '@', query: string, limit = 8): CommandDescriptor[] {
  const q = query.toLowerCase();
  const pool = catalog.filter((e) => (trigger === '@' ? e.source === 'agent' : SLASH_SOURCES.has(e.source)));
  const starts = pool.filter((e) => names(e).some((n) => n.startsWith(q)) || (e.title ?? '').toLowerCase().startsWith(q));
  const contains = pool.filter((e) => !starts.includes(e) && (names(e).some((n) => n.includes(q)) || (e.title ?? '').toLowerCase().includes(q)));
  return [...starts, ...contains].slice(0, limit);
}

export type ComposerInput =
  | { kind: 'text'; text: string }
  | { kind: 'agent'; name: string; entry: CommandDescriptor; message: string }
  | { kind: 'command' | 'choice'; name: string; entry: CommandDescriptor; tokens: string[] }
  | { kind: 'tool'; name: string; entry: CommandDescriptor; tokens: string[]; args: Record<string, any>; missing: string[] }
  | { kind: 'unknown'; trigger: '/' | '@'; name: string };

/** What a submitted line means: a command/tool/choice (`/name ...`), a message to an agent (`@agent ...`), or text. */
export function parseComposerInput(text: string, catalog: readonly CommandDescriptor[]): ComposerInput {
  const trimmed = text.trim();
  if (trimmed.startsWith('/') && trimmed.length > 1) {
    const [name, ...tokens] = parseCommandLine(trimmed.slice(1));
    const entry = name ? findCommand(catalog, name) : undefined;
    if (!entry || !name) return { kind: 'unknown', trigger: '/', name: name ?? '' };
    if (entry.source === 'tool') {
      const args = toolArgsFromTokens(tokens, entry.parameters);
      return { kind: 'tool', name: entry.name, entry, tokens, args, missing: missingToolArgs(entry.parameters, args) };
    }
    return { kind: entry.source as 'command' | 'choice', name: entry.name, entry, tokens };
  }
  const at = /^@([^\s@]+)\s*([\s\S]*)$/.exec(trimmed);
  if (at) {
    const entry = findCommand(catalog, at[1], new Set(['agent']));
    if (!entry) return { kind: 'unknown', trigger: '@', name: at[1] };
    return { kind: 'agent', name: entry.name, entry, message: at[2].trim() };
  }
  return { kind: 'text', text: trimmed };
}

/** Tab completion for a line (CLI): candidate completions of the word being typed, and that word. */
export function completeLine(catalog: readonly CommandDescriptor[], line: string): [string[], string] {
  const trigger = findComposerTrigger(line);
  if (!trigger) return [[], line];
  const word = line.slice(trigger.start, trigger.end);
  const hits = matchCommands(catalog, trigger.trigger, trigger.query, 50).map((e) => `${trigger.trigger}${e.name}`);
  return [hits, word];
}
