import { defineTool } from './CuratorTool.js';
import { PluginConfig, type ConfigScope, type ConfigNamespaceView } from '../services/PluginConfigService.js';
import { AgentRoleService } from '../services/AgentRoleService.js';
import { requireHumanCaller } from './sessionScope.js';

/**
 * Saved plugin configuration (PluginConfigService): read the declared keys and save values per scope. The project
 * and user always come from the calling session; only people may save. Saving at project scope needs the
 * `config:project` role, at system scope `config:system` (user scope: your own values, no role).
 */

const configApi = (ctx: Record<string, any>) => {
  const api = ctx.tryService?.(PluginConfig);
  if (!api) throw new Error('Plugin configuration is only available inside a Curator processor');
  return api;
};

export const CONFIG_SCOPE_ROLES: Record<ConfigScope, string | undefined> = {
  user: undefined,
  project: 'config:project',
  system: 'config:system',
};

async function authorize(ctx: Record<string, any>, toolName: string, scope: ConfigScope): Promise<string> {
  const userId = requireHumanCaller(ctx, toolName);
  const requiredRole = CONFIG_SCOPE_ROLES[scope];
  if (requiredRole && ctx.prisma) {
    const check = await AgentRoleService.validateActorToolAccess(
      ctx.prisma,
      { userId, projectId: ctx.projectId != null ? String(ctx.projectId) : undefined } as any,
      toolName,
      { name: toolName, requiredRole, accessLevel: 'safe_write' } as any
    );
    if (!check.allowed) throw new Error(check.reason || `Saving ${scope} config needs the '${requiredRole}' role`);
  }
  return userId;
}

const session = (ctx: Record<string, any>) => ({
  projectId: ctx.projectId != null ? String(ctx.projectId) : null,
  userId: ctx.userId != null ? String(ctx.userId) : null,
});

const scopeParam = { type: 'string', enum: ['system', 'project', 'user'], description: "Where to save: 'user' (you, in this project), 'project' (this project), 'system' (everywhere)." };

export const config_get = defineTool<{ namespace?: string }>({
  name: 'config_get',
  description: 'Lists the declared plugin configuration (per namespace and key: JSON Schema, allowed scopes, default, effective value and its source, saved values) for the calling session.',
  accessLevel: 'read_only',
  parameters: {
    type: 'object',
    properties: { namespace: { type: 'string', description: 'Only this namespace.' } },
    additionalProperties: false,
  },
  execute: async (args, ctx) => {
    const namespaces: ConfigNamespaceView[] = await configApi(ctx).describe(session(ctx));
    return { namespaces: args.namespace ? namespaces.filter((n) => n.namespace === args.namespace) : namespaces };
  },
});

export const config_set = defineTool<{ namespace: string; key: string; scope: ConfigScope; value: unknown }>({
  name: 'config_set',
  description: "Saves a plugin configuration value at a scope; it is validated against the key's schema and allowed scopes. Secrets must be secret://NAME references. Human callers only.",
  accessLevel: 'safe_write',
  parameters: {
    type: 'object',
    properties: {
      namespace: { type: 'string' },
      key: { type: 'string' },
      scope: scopeParam,
      value: { description: "The value; validated against the key's JSON Schema." },
    },
    required: ['namespace', 'key', 'scope', 'value'],
    additionalProperties: false,
  },
  execute: async (args, ctx) => {
    const userId = await authorize(ctx, 'config_set', args.scope);
    await configApi(ctx).set({ ...args, ...session(ctx), updatedBy: userId });
    return { saved: true, namespace: args.namespace, key: args.key, scope: args.scope };
  },
});

export const config_unset = defineTool<{ namespace: string; key: string; scope: ConfigScope }>({
  name: 'config_unset',
  description: 'Removes the value saved at a scope, so the next scope down (or the default) applies. Human callers only.',
  accessLevel: 'safe_write',
  parameters: {
    type: 'object',
    properties: { namespace: { type: 'string' }, key: { type: 'string' }, scope: scopeParam },
    required: ['namespace', 'key', 'scope'],
    additionalProperties: false,
  },
  execute: async (args, ctx) => {
    const userId = await authorize(ctx, 'config_unset', args.scope);
    const removed = await configApi(ctx).unset({ ...args, ...session(ctx), updatedBy: userId });
    return { removed, namespace: args.namespace, key: args.key, scope: args.scope };
  },
});

export const pluginConfigTools = { config_get, config_set, config_unset };
