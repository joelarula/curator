/**
 * UI surfaces: structured results a tool returns for people (`uiSurface` on its result) and clients render in a
 * panel (web console) or as text (CLI). Pure and browser-safe.
 */

/** Built-in surface components; any other name is a client-registered component (`adapter.customComponents`). */
export type CuratorSurfaceComponent =
  | 'resource-collection'
  | 'resource-detail'
  | 'table'
  | 'markdown'
  | 'code'
  | 'json'
  | 'mermaid'
  | 'html'
  | 'svg'
  | 'image'
  | (string & {});

export interface CuratorSurface {
  component: CuratorSurfaceComponent;
  title?: string;
  subtitle?: string;
  /**
   * Content of the built-in components: table `{ columns?, rows }`; markdown/mermaid/html/svg `string` (or `{ text }`);
   * code `{ language?, text }`; json any value; image `{ src, alt? }`.
   */
  data?: unknown;
  // Resource components (resource-collection / resource-detail) and custom components
  items?: any[];
  item?: any;
  total?: number;
  viewMode?: string;
  categories?: any[];
  authors?: any[];
  filters?: Record<string, any>;
  props?: Record<string, any>;
}

export interface SurfaceTable {
  columns: { key: string; title: string }[];
  rows: Record<string, unknown>[];
}

const isPlain = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

/** True for a value shaped like a surface (an object with a string `component`). */
export function isSurface(value: unknown): value is CuratorSurface {
  return isPlain(value) && typeof value.component === 'string' && value.component.length > 0;
}

/** The surface a tool result declares: its `uiSurface` (or `surface`) field, or the result itself when it is one. */
export function extractSurface(payload: unknown): CuratorSurface | null {
  if (!isPlain(payload)) return null;
  if (isSurface(payload.uiSurface)) return payload.uiSurface;
  if (isSurface(payload.surface)) return payload.surface;
  return isSurface(payload) && ('data' in payload || 'items' in payload || 'item' in payload) ? payload : null;
}

/** Text content of markdown / mermaid / html / svg / code surfaces. */
export function surfaceText(surface: CuratorSurface): string {
  const d = surface.data as any;
  if (typeof d === 'string') return d;
  if (isPlain(d) && typeof d.text === 'string') return d.text;
  return '';
}

/** Table data normalized: columns from `columns` (strings or `{ key, title }`) or the rows' keys; array rows keyed by column. */
export function surfaceTable(surface: CuratorSurface): SurfaceTable {
  const d: any = surface.data ?? {};
  const rawRows: any[] = Array.isArray(d) ? d : Array.isArray(d.rows) ? d.rows : Array.isArray(surface.items) ? surface.items : [];
  let columns: { key: string; title: string }[] = Array.isArray(d.columns)
    ? d.columns.map((c: any, i: number) => (typeof c === 'string' ? { key: c, title: c } : { key: String(c.key ?? i), title: String(c.title ?? c.key ?? i) }))
    : [];
  if (columns.length === 0) {
    const keys = new Set<string>();
    for (const r of rawRows.slice(0, 50)) if (isPlain(r)) Object.keys(r).forEach((k) => keys.add(k));
    columns = [...keys].map((k) => ({ key: k, title: k }));
  }
  const rows = rawRows.map((r) => (Array.isArray(r) ? Object.fromEntries(columns.map((c, i) => [c.key, r[i]])) : isPlain(r) ? r : { value: r }));
  if (columns.length === 0 && rows.length) columns = [{ key: 'value', title: 'value' }];
  return { columns, rows };
}

const LABELS: Record<string, string> = {
  'resource-collection': 'Resources',
  'resource-detail': 'Resource',
  table: 'Table',
  markdown: 'Document',
  code: 'Code',
  json: 'JSON',
  mermaid: 'Diagram',
  html: 'Page',
  svg: 'Image',
  image: 'Image',
};

/** One-line description: "Table: Open orders · 12 rows". */
export function describeSurface(surface: CuratorSurface): string {
  const kind = LABELS[surface.component] ?? surface.component;
  const parts = [surface.title ? `${kind}: ${surface.title}` : kind];
  if (surface.component === 'table') parts.push(`${surfaceTable(surface).rows.length} rows`);
  else if (surface.component === 'resource-collection') parts.push(`${surface.total ?? surface.items?.length ?? 0} items`);
  return parts.join(' · ');
}

const cell = (v: unknown) => (v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)).replace(/\s+/g, ' ');

/** Terminal rendering: tables as aligned text (first `maxRows`), other surfaces as their description. */
export function surfaceToText(surface: CuratorSurface, options: { maxRows?: number; maxWidth?: number } = {}): string {
  const head = describeSurface(surface);
  if (surface.component !== 'table') {
    const text = ['markdown', 'code'].includes(surface.component) ? surfaceText(surface) : '';
    return text ? `${head}\n${text}` : `${head} (open in the web console)`;
  }
  const { columns, rows } = surfaceTable(surface);
  const maxRows = options.maxRows ?? 20;
  const maxWidth = options.maxWidth ?? 40;
  const shown = rows.slice(0, maxRows).map((r) => columns.map((c) => cell(r[c.key]).slice(0, maxWidth)));
  const widths = columns.map((c, i) => Math.max(c.title.length, ...shown.map((r) => r[i].length)));
  const line = (vals: string[]) => vals.map((v, i) => v.padEnd(widths[i])).join('  ').trimEnd();
  const out = [head, line(columns.map((c) => c.title.slice(0, maxWidth))), line(widths.map((w) => '-'.repeat(w))), ...shown.map(line)];
  if (rows.length > maxRows) out.push(`… ${rows.length - maxRows} more rows`);
  return out.join('\n');
}

/** A part of agent text worth opening in the panel (fenced diagram/page/JSON block, or a Markdown table). */
export interface TextPanelBlock {
  surface: CuratorSurface;
  label: string;
}

const FENCE = /```(mermaid|html|svg|json)\s*\n([\s\S]*?)```/g;
const MD_TABLE = /(?:^|\n)(\|[^\n]+\|\n\|[\s:|-]+\|\n(?:\|[^\n]*\|(?:\n|$))+)/g;

function parseMarkdownTable(block: string): SurfaceTable | null {
  const lines = block.trim().split('\n').map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
  if (lines.length < 3) return null;
  const columns = lines[0].map((t, i) => ({ key: `c${i}`, title: t }));
  const rows = lines.slice(2).map((cells) => Object.fromEntries(columns.map((c, i) => [c.key, cells[i] ?? ''])));
  return { columns, rows };
}

/** Panel candidates in agent text, in order: fenced mermaid / html / svg / json blocks and Markdown tables. */
export function textPanelBlocks(text: string): TextPanelBlock[] {
  if (!text) return [];
  const found: { at: number; block: TextPanelBlock }[] = [];
  for (const m of text.matchAll(FENCE)) {
    const lang = m[1];
    const body = m[2].trim();
    if (!body) continue;
    if (lang === 'json') {
      try {
        found.push({ at: m.index ?? 0, block: { label: 'Open JSON', surface: { component: 'json', title: 'JSON', data: JSON.parse(body) } } });
      } catch {
        // not JSON after all: leave it as text
      }
      continue;
    }
    const label = lang === 'mermaid' ? 'Open diagram' : lang === 'svg' ? 'Open image' : 'Open page';
    found.push({ at: m.index ?? 0, block: { label, surface: { component: lang, title: label.replace('Open ', ''), data: body } } });
  }
  const withoutFences = text.replace(FENCE, (s) => ' '.repeat(s.length));
  for (const m of withoutFences.matchAll(MD_TABLE)) {
    const table = parseMarkdownTable(m[1]);
    if (table) found.push({ at: m.index ?? 0, block: { label: 'Open table', surface: { component: 'table', title: 'Table', data: table } } });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.block);
}
