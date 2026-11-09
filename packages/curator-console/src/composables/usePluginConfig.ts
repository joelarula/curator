import { ref } from 'vue';
import type { HarnessToolRunner } from './useInterrupts';

export type ConfigScope = 'system' | 'project' | 'user';

/** One key as `config_get` describes it (PluginConfigService.describe). */
export interface ConfigKeyView {
  key: string;
  schema: Record<string, any>;
  scopes: ConfigScope[];
  default: unknown;
  value: unknown;
  source: 'default' | ConfigScope;
  saved: Partial<Record<ConfigScope, unknown>>;
}

export interface ConfigNamespaceView {
  namespace: string;
  title?: string;
  description?: string;
  keys: ConfigKeyView[];
}

/** Plugin settings through the config tools (`config_get`, `config_set`, `config_unset`) run by the host. */
export function usePluginConfig(runTool: HarnessToolRunner) {
  const namespaces = ref<ConfigNamespaceView[]>([]);
  const loading = ref(false);
  const busyKey = ref<string | null>(null);
  const error = ref<string | null>(null);

  async function load(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const res = await runTool('config_get', {});
      namespaces.value = Array.isArray(res?.namespaces) ? res.namespaces : [];
    } catch (err: any) {
      error.value = err?.message ?? String(err);
    } finally {
      loading.value = false;
    }
  }

  async function write(tool: 'config_set' | 'config_unset', args: Record<string, unknown>): Promise<boolean> {
    busyKey.value = `${args.namespace}.${args.key}`;
    error.value = null;
    try {
      await runTool(tool, args);
      await load();
      return true;
    } catch (err: any) {
      error.value = err?.message ?? String(err);
      return false;
    } finally {
      busyKey.value = null;
    }
  }

  const save = (namespace: string, key: string, scope: ConfigScope, value: unknown) => write('config_set', { namespace, key, scope, value });
  const reset = (namespace: string, key: string, scope: ConfigScope) => write('config_unset', { namespace, key, scope });

  return { namespaces, loading, busyKey, error, load, save, reset };
}

export type PluginConfigHandle = ReturnType<typeof usePluginConfig>;
