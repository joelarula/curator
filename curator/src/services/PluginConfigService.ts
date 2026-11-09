/**
 * Saved plugin configuration (plugin `configSchema`): validates and stores values in `PluginConfigValue`, and resolves
 * the configuration a request sees as `$config`: plugin/host defaults < system < project < user.
 *
 * Scope keys come from the caller's session (projectId, userId), never from tool arguments. Secrets are stored only
 * as `secret://NAME` references (resolve them with SecretService when used).
 */
import AjvModule from 'ajv';
import type { CuratorConfig } from '../engine/CuratorContracts.js';
import { defineService } from '../engine/nodes/NodeHandler.js';

const Ajv = (AjvModule as any).default || AjvModule;
const ajv = new Ajv({ allErrors: true, strict: false });
ajv.addFormat('secret', /^secret:\/\/[A-Za-z0-9_-]+$/);

export type ConfigScope = 'system' | 'project' | 'user';
export const CONFIG_SCOPES: readonly ConfigScope[] = ['system', 'project', 'user'];
const SYSTEM_PROJECT = 'system';

export interface ConfigSession {
  projectId?: string | null;
  userId?: string | null;
}

export interface ConfigWrite extends ConfigSession {
  namespace: string;
  key: string;
  scope: ConfigScope;
  value: unknown;
  updatedBy?: string | null;
}

/** One key as a client shows it: schema, default, effective value and where it came from. */
export interface ConfigKeyView {
  key: string;
  schema: Record<string, any>;
  scopes: ConfigScope[];
  default: unknown;
  value: unknown;
  source: 'default' | ConfigScope;
  /** The values saved per scope that the session can see. */
  saved: Partial<Record<ConfigScope, unknown>>;
}

export interface ConfigNamespaceView {
  namespace: string;
  title?: string;
  description?: string;
  keys: ConfigKeyView[];
}

/** Lookup key for the service (`ctx.service(PluginConfig)` in tools and node handlers). */
export const PluginConfig = defineService<PluginConfigService>('PluginConfig');

const clone = <T>(v: T): T => (v === undefined ? v : structuredClone(v));
const isPlain = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

export class PluginConfigService {
  private cache = new Map<string, { at: number; config: CuratorConfig }>();
  private tableMissing = false;

  constructor(
    private readonly prisma: any,
    private readonly schemas: () => Map<string, Record<string, any>>,
    private readonly defaults: () => CuratorConfig,
    private readonly options: { cacheMs?: number; now?: () => number } = {}
  ) {}

  private now() {
    return this.options.now?.() ?? Date.now();
  }

  /** Where a key may be saved (`x-curator-scope`, default system). */
  static allowedScopes(propertySchema: Record<string, any> | undefined): ConfigScope[] {
    const raw = propertySchema?.['x-curator-scope'];
    const list = (Array.isArray(raw) ? raw : raw ? [raw] : ['system']).filter((s: any) => CONFIG_SCOPES.includes(s));
    return list.length ? list : ['system'];
  }

  propertySchema(namespace: string, key: string): Record<string, any> | undefined {
    const props = this.schemas().get(namespace)?.properties;
    return isPlain(props) && isPlain(props[key]) ? props[key] : undefined;
  }

  /** Validates a write; returns the errors (empty when it may be saved). */
  validate(write: Pick<ConfigWrite, 'namespace' | 'key' | 'scope' | 'value'> & ConfigSession): string[] {
    const schema = this.propertySchema(write.namespace, write.key);
    if (!schema) return [`Unknown config key '${write.namespace}.${write.key}'`];
    if (!CONFIG_SCOPES.includes(write.scope)) return [`Unknown scope '${write.scope}'`];
    const scopes = PluginConfigService.allowedScopes(schema);
    if (!scopes.includes(write.scope)) return [`'${write.namespace}.${write.key}' can be saved at ${scopes.join(', ')} scope, not ${write.scope}`];
    if (write.scope !== 'system' && !write.projectId) return [`A ${write.scope} value needs the session's project`];
    if (write.scope === 'user' && !write.userId) return ['A user value needs the calling user'];
    const check = ajv.compile(schema);
    if (!check(write.value)) {
      return (check.errors ?? []).map((e: any) => `${write.namespace}.${write.key}${e.instancePath || ''} ${e.message}`);
    }
    return [];
  }

  private scopeKeys(scope: ConfigScope, session: ConfigSession) {
    return {
      projectId: scope === 'system' ? SYSTEM_PROJECT : String(session.projectId),
      userId: scope === 'user' ? String(session.userId) : '',
    };
  }

  /** Saves a value (replacing the one saved at that scope). Throws with the validation errors. */
  async set(write: ConfigWrite): Promise<void> {
    const errors = this.validate(write);
    if (errors.length) throw new Error(`Invalid config value: ${errors.join('; ')}`);
    const keys = this.scopeKeys(write.scope, write);
    const where = { namespace: write.namespace, key: write.key, scope: write.scope, ...keys, existent: true };
    const existing = await this.prisma.pluginConfigValue.findFirst({ where });
    const data = { value: clone(write.value) as any, updatedBy: write.updatedBy ?? null };
    if (existing) await this.prisma.pluginConfigValue.update({ where: { id: existing.id }, data });
    else await this.prisma.pluginConfigValue.create({ data: { ...where, ...data } });
    this.invalidate();
  }

  /** Removes the value saved at a scope (soft delete); the next scope down applies again. */
  async unset(write: Omit<ConfigWrite, 'value'>): Promise<boolean> {
    if (!this.propertySchema(write.namespace, write.key)) throw new Error(`Unknown config key '${write.namespace}.${write.key}'`);
    const keys = this.scopeKeys(write.scope, write);
    const res = await this.prisma.pluginConfigValue.updateMany({
      where: { namespace: write.namespace, key: write.key, scope: write.scope, ...keys, existent: true },
      data: { existent: null, updatedBy: write.updatedBy ?? null },
    });
    this.invalidate();
    return (res?.count ?? 0) > 0;
  }

  /** Saved values the session can see (system, its project, its user in that project). */
  private async rows(session: ConfigSession): Promise<any[]> {
    if (this.tableMissing || !this.prisma?.pluginConfigValue || this.schemas().size === 0) return [];
    const or: any[] = [{ scope: 'system', projectId: SYSTEM_PROJECT, userId: '' }];
    if (session.projectId) {
      or.push({ scope: 'project', projectId: String(session.projectId), userId: '' });
      if (session.userId) or.push({ scope: 'user', projectId: String(session.projectId), userId: String(session.userId) });
    }
    try {
      return await this.prisma.pluginConfigValue.findMany({
        where: { existent: true, namespace: { in: [...this.schemas().keys()] }, OR: or },
      });
    } catch (err: any) {
      // A database provisioned before the table existed: keep running on defaults
      if (/does not exist|no such table|doesn't exist/i.test(String(err?.message))) {
        this.tableMissing = true;
        return [];
      }
      throw err;
    }
  }

  /** The configuration for a session: defaults with saved values applied per key (system, then project, then user). */
  async resolve(session: ConfigSession = {}): Promise<CuratorConfig> {
    const defaults = this.defaults() ?? {};
    if (this.schemas().size === 0) return defaults;
    const cacheKey = `${session.projectId ?? ''}|${session.userId ?? ''}`;
    const hit = this.cache.get(cacheKey);
    if (hit && this.now() - hit.at < (this.options.cacheMs ?? 5000)) return hit.config;

    const rows = await this.rows(session);
    let config = defaults;
    if (rows.length) {
      config = structuredClone(defaults);
      for (const scope of CONFIG_SCOPES) {
        for (const row of rows.filter((r) => r.scope === scope)) {
          if (!this.propertySchema(row.namespace, row.key)) continue;
          if (!isPlain(config[row.namespace])) config[row.namespace] = {};
          config[row.namespace][row.key] = clone(row.value);
        }
      }
      deepFreeze(config);
    }
    this.cache.set(cacheKey, { at: this.now(), config });
    return config;
  }

  /** Every declared namespace and key with its default, effective value, source and saved values (for settings UIs). */
  async describe(session: ConfigSession = {}): Promise<ConfigNamespaceView[]> {
    const defaults = this.defaults() ?? {};
    const rows = await this.rows(session);
    return [...this.schemas().entries()].map(([namespace, schema]) => {
      const props = isPlain(schema.properties) ? schema.properties : {};
      const keys = Object.entries(props).map(([key, propSchema]: [string, any]) => {
        const saved: Partial<Record<ConfigScope, unknown>> = {};
        for (const row of rows) if (row.namespace === namespace && row.key === key) saved[row.scope as ConfigScope] = row.value;
        const source = ([...CONFIG_SCOPES].reverse().find((s) => s in saved) ?? 'default') as ConfigKeyView['source'];
        const def = isPlain(defaults[namespace]) ? defaults[namespace][key] : undefined;
        return {
          key,
          schema: propSchema,
          scopes: PluginConfigService.allowedScopes(propSchema),
          default: clone(def),
          value: clone(source === 'default' ? def : saved[source]),
          source,
          saved,
        };
      });
      return { namespace, title: schema.title, description: schema.description, keys };
    });
  }

  /** Drops cached resolutions (after writes; other workers see changes within the cache time). */
  invalidate(): void {
    this.cache.clear();
  }
}

function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const child of Object.values(v as any)) deepFreeze(child);
  }
  return v;
}
