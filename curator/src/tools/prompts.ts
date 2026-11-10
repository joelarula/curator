import { defineTool, type CuratorToolContext } from './CuratorTool.js';
import { getProjectAncestorIds, SYSTEM_PROJECT_ID } from '../services/ProjectScopeService.js';

/**
 * Prompt library (SavedPrompt): prompts saved per project, offered in the composer `/` list and the CLI. A prompt's
 * text may hold `{name}` placeholders, filled from arguments by `prompt_get`. Prompts of a parent project are visible
 * in its sub-projects (a sub-project's prompt of the same name wins); `system` prompts everywhere. The project always
 * comes from the calling session. Saving and deleting need the `prompts:write` role. MCP prompts stay in the
 * MCP client (`mcp_prompts_list` / `mcp_prompt_get`).
 */

type Ctx = CuratorToolContext & Record<string, any>;

export interface PromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

const PLACEHOLDER = /\{([A-Za-z_][\w-]*)\}/g;
const NAME = /^[A-Za-z0-9][\w.-]{0,99}$/;
const MAX_TEXT = 20_000;

/** Placeholder names in a prompt text, in order of first use. */
export function promptPlaceholders(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(PLACEHOLDER)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

/** The text with `{name}` placeholders filled; unknown placeholders stay as they are. */
export function renderPrompt(text: string, args: Record<string, unknown> = {}): string {
  return text.replace(PLACEHOLDER, (whole, name: string) => (args[name] !== undefined && args[name] !== null ? String(args[name]) : whole));
}

function requirePrisma(ctx: Ctx): any {
  if (!ctx.prisma?.savedPrompt) throw new Error('The prompt library needs the SavedPrompt table (update the database schema).');
  return ctx.prisma;
}

/** The session project and its ancestors, nearest first, then `system`. */
async function visibleProjects(prisma: any, ctx: Ctx): Promise<string[]> {
  const projectId = ctx.projectId != null ? String(ctx.projectId) : null;
  const chain = projectId ? [projectId, ...(await getProjectAncestorIds(prisma, projectId))] : [];
  return [...new Set([...chain, SYSTEM_PROJECT_ID])];
}

const argumentsOf = (row: any): PromptArgument[] =>
  Array.isArray(row.arguments) ? row.arguments : promptPlaceholders(String(row.text ?? '')).map((name) => ({ name, required: true }));

/** Visible prompts, nearest project first; the nearest prompt of a name hides the others. */
async function visiblePrompts(prisma: any, ctx: Ctx): Promise<any[]> {
  const projects = await visibleProjects(prisma, ctx);
  const rows = await prisma.savedPrompt.findMany({ where: { projectId: { in: projects }, existent: true }, orderBy: { name: 'asc' } });
  const rank = (p: string) => projects.indexOf(p);
  const byName = new Map<string, any>();
  for (const row of [...rows].sort((a, b) => rank(a.projectId) - rank(b.projectId))) if (!byName.has(row.name)) byName.set(row.name, row);
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export const prompt_list = defineTool<{ query?: string }>({
  name: 'prompt_list',
  description: 'Lists saved prompts visible in the current project (its own, its parent projects\', and system prompts) with their arguments.',
  accessLevel: 'read_only',
  requiredRole: 'agent:reader',
  parameters: { type: 'object', properties: { query: { type: 'string', description: 'Only prompts whose name or title contains this.' } } },
  execute: async (args, ctx: Ctx) => {
    const prisma = requirePrisma(ctx);
    const q = typeof args.query === 'string' ? args.query.toLowerCase() : '';
    const rows = (await visiblePrompts(prisma, ctx)).filter(
      (r) => !q || r.name.toLowerCase().includes(q) || String(r.title ?? '').toLowerCase().includes(q)
    );
    return {
      prompts: rows.map((r) => ({ name: r.name, title: r.title ?? null, description: r.description ?? null, projectId: r.projectId, arguments: argumentsOf(r) })),
    };
  },
});

export const prompt_get = defineTool<{ name: string; arguments?: Record<string, unknown> }>({
  name: 'prompt_get',
  description: 'Returns a saved prompt with its {placeholders} filled from the arguments.',
  accessLevel: 'read_only',
  requiredRole: 'agent:reader',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Prompt name.' },
      arguments: { type: 'object', description: 'Values for the prompt placeholders.' },
    },
    required: ['name'],
  },
  execute: async (args, ctx: Ctx) => {
    const prisma = requirePrisma(ctx);
    const row = (await visiblePrompts(prisma, ctx)).find((r) => r.name === args.name);
    if (!row) throw new Error(`Prompt '${args.name}' not found`);
    const values = args.arguments ?? {};
    const missing = argumentsOf(row).filter((a) => a.required !== false && (values[a.name] === undefined || values[a.name] === '')).map((a) => a.name);
    if (missing.length > 0) throw new Error(`Prompt '${row.name}' needs: ${missing.join(', ')}`);
    return { name: row.name, title: row.title ?? null, text: renderPrompt(row.text, values) };
  },
});

export const prompt_save = defineTool<{ name: string; text: string; title?: string; description?: string; arguments?: PromptArgument[] }>({
  name: 'prompt_save',
  description: 'Saves (or replaces) a prompt in the current project. Use {name} placeholders for arguments.',
  accessLevel: 'safe_write',
  requiredRole: 'prompts:write',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Short name used after / (letters, digits, - _ .).' },
      text: { type: 'string', description: 'Prompt text; {name} placeholders become arguments.' },
      title: { type: 'string', description: 'Display title.' },
      description: { type: 'string', description: 'What the prompt is for.' },
      arguments: {
        type: 'array',
        description: 'Argument descriptions (default: one required argument per placeholder).',
        items: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' }, required: { type: 'boolean' } }, required: ['name'] },
      },
    },
    required: ['name', 'text'],
  },
  execute: async (args, ctx: Ctx) => {
    const prisma = requirePrisma(ctx);
    const name = String(args.name ?? '').trim();
    if (!NAME.test(name)) throw new Error('A prompt name is 1-100 letters, digits, - _ or . and starts with a letter or digit.');
    const text = String(args.text ?? '');
    if (!text.trim()) throw new Error('A prompt needs text.');
    if (text.length > MAX_TEXT) throw new Error(`A prompt is at most ${MAX_TEXT} characters.`);
    const projectId = ctx.projectId != null ? String(ctx.projectId) : SYSTEM_PROJECT_ID;
    const data = {
      title: args.title?.trim() || null,
      description: args.description?.trim() || null,
      text,
      arguments: Array.isArray(args.arguments) ? (args.arguments as any) : null,
      createdBy: ctx.userId != null ? String(ctx.userId) : null,
    };
    const existing = await prisma.savedPrompt.findFirst({ where: { projectId, name, existent: true } });
    const row = existing
      ? await prisma.savedPrompt.update({ where: { id: existing.id }, data })
      : await prisma.savedPrompt.create({ data: { ...data, projectId, name } });
    return { saved: true, name: row.name, projectId, arguments: argumentsOf(row) };
  },
});

export const prompt_delete = defineTool<{ name: string }>({
  name: 'prompt_delete',
  description: 'Deletes a saved prompt of the current project.',
  accessLevel: 'safe_write',
  requiredRole: 'prompts:write',
  parameters: { type: 'object', properties: { name: { type: 'string', description: 'Prompt name.' } }, required: ['name'] },
  execute: async (args, ctx: Ctx) => {
    const prisma = requirePrisma(ctx);
    const projectId = ctx.projectId != null ? String(ctx.projectId) : SYSTEM_PROJECT_ID;
    // Soft delete: existent NULL keeps the row out of the unique key
    const { count } = await prisma.savedPrompt.updateMany({ where: { projectId, name: args.name, existent: true }, data: { existent: null } });
    return { deleted: count > 0 };
  },
});

export const promptTools = { prompt_list, prompt_get, prompt_save, prompt_delete };
