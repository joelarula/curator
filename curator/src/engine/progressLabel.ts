/**
 * Display labels for progress events (`label` on step.* and tool.* events). Labels come only from definitions
 * (node names, tool/agent/module names, tool `ui.progressLabel`), never from argument values, which can hold secrets
 * or personal data.
 */
import type { CuratorToolUi } from '../tools/CuratorTool.js';

const MAX_LABEL = 80;

const clean = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, MAX_LABEL) : undefined;

/** Label of a tool: its `ui.progressLabel`, else its name. */
export function toolProgressLabel(tool: { ui?: CuratorToolUi } | null | undefined, toolName: string): string | undefined {
  return clean(tool?.ui?.progressLabel) ?? clean(toolName);
}

/**
 * Label of a step, first match: the node's `name` (set by the workflow author); a tool node's tool label; an agent
 * node's `agentName`; a call node's `ref`. Undefined otherwise (clients show the node type).
 */
export function stepProgressLabel(
  ast: { type?: string; name?: unknown; toolName?: unknown; agentName?: unknown; ref?: unknown } | null | undefined,
  resolveTool: (name: string) => { ui?: CuratorToolUi } | null | undefined
): string | undefined {
  if (!ast) return undefined;
  const named = clean(ast.name);
  if (named) return named;
  switch (ast.type) {
    case 'Curator_Tool':
      return typeof ast.toolName === 'string' ? toolProgressLabel(resolveTool(ast.toolName), ast.toolName) : undefined;
    case 'Curator_Agent':
      return clean(ast.agentName);
    case 'Curator_Call':
      return clean(ast.ref);
    default:
      return undefined;
  }
}
