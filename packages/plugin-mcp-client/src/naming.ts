/** Server names become part of tool aliases (`mcp.<server>.<tool>`), so no dots or `@`. */
export const SERVER_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$/;

export type AccessLevel = 'read_only' | 'safe_write' | 'elevated' | 'destructive';

/** Name workflows use for a remote tool; resolved within the request's project. */
export function toolAlias(server: string, remoteName: string): string {
  return `mcp.${server}.${remoteName}`;
}

/** Globally unique Tool key (Tool.name, permissions, approvals): the alias qualified by project. */
export function toolKey(projectId: string, server: string, remoteName: string): string {
  return `${toolAlias(server, remoteName)}@${projectId}`;
}

/** Splits `mcp.<server>.<tool>`; qualified keys (with `@project`) are not aliases. */
export function parseToolAlias(name: string): { server: string; remoteName: string } | null {
  if (!name.startsWith('mcp.') || name.includes('@')) return null;
  const rest = name.slice(4);
  const dot = rest.indexOf('.');
  if (dot <= 0 || dot === rest.length - 1) return null;
  return { server: rest.slice(0, dot), remoteName: rest.slice(dot + 1) };
}

/**
 * Initial access level from MCP tool annotations. Annotations are hints from an untrusted
 * server: they only set the level when the Tool row is created; admins own it afterwards.
 * Unannotated tools default to `fallback` (approval-gated `elevated` unless configured).
 */
export function accessLevelFromAnnotations(annotations: Record<string, any> | undefined, fallback: AccessLevel): AccessLevel {
  if (annotations?.readOnlyHint === true) return 'read_only';
  if (annotations?.destructiveHint === true) return 'destructive';
  if (annotations?.destructiveHint === false) return 'safe_write';
  return fallback;
}
