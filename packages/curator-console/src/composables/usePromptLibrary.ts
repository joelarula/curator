import { computed, ref, type Ref } from 'vue';
import { promptParameters, toolUsage, type CommandDescriptor, type PromptArgumentInfo } from '@curator/host/contracts';
import type { HarnessToolRunner } from './useInterrupts';

/** Where a library prompt comes from: the project library (`prompt_get`) or a remote MCP server (`mcp_prompt_get`). */
export type PromptOrigin = { kind: 'saved'; name: string } | { kind: 'mcp'; server: string; name: string };

/**
 * Prompt library for the composer `/` list: saved project prompts (`prompt_list`) and MCP prompts
 * (`mcp_prompts_list`), as `source: 'prompt'` entries whose `parameters` describe the arguments. Each source is used
 * only when the user may run its tools.
 */
export function usePromptLibrary(tools: Ref<any[]>, runTool: HarnessToolRunner) {
  const entries = ref<CommandDescriptor[]>([]);
  const error = ref<string | null>(null);
  const toolNames = computed(() => new Set(tools.value.map((t: any) => t?.name)));
  const savedAvailable = computed(() => toolNames.value.has('prompt_list') && toolNames.value.has('prompt_get'));
  const mcpAvailable = computed(() => toolNames.value.has('mcp_prompts_list') && toolNames.value.has('mcp_prompt_get'));
  const canSave = computed(() => toolNames.value.has('prompt_save'));

  const entry = (name: string, p: { title?: string | null; description?: string | null; arguments?: PromptArgumentInfo[] | null }, origin: PromptOrigin): CommandDescriptor => {
    const parameters = promptParameters(p.arguments ?? []);
    return {
      name,
      source: 'prompt',
      title: p.title ?? undefined,
      description: p.description ?? undefined,
      parameters,
      usage: toolUsage({ parameters } as any),
      icon: origin.kind === 'mcp' ? 'mdi-cloud-outline' : 'mdi-text-box-outline',
      value: origin,
    };
  };

  /** Reloads both sources; a failing source is reported in `error` and left out. */
  async function load(): Promise<void> {
    const out: CommandDescriptor[] = [];
    const failures: string[] = [];
    if (savedAvailable.value) {
      try {
        const res = await runTool('prompt_list', {});
        for (const p of res?.prompts ?? []) out.push(entry(p.name, p, { kind: 'saved', name: p.name }));
      } catch (err: any) {
        failures.push(err?.message ?? String(err));
      }
    }
    if (mcpAvailable.value) {
      try {
        const res = await runTool('mcp_prompts_list', {});
        const rows: any[] = Array.isArray(res) ? res : res?.prompts ?? [];
        const taken = new Set(out.map((e) => e.name));
        for (const p of rows) {
          if (!p?.server || !p?.name) continue;
          const name = taken.has(p.name) ? `${p.server}.${p.name}` : p.name;
          taken.add(name);
          out.push(entry(name, p, { kind: 'mcp', server: p.server, name: p.name }));
        }
      } catch (err: any) {
        failures.push(err?.message ?? String(err));
      }
    }
    entries.value = out;
    error.value = failures.length ? failures.join('; ') : null;
  }

  /** The prompt text with its arguments filled. */
  async function render(item: CommandDescriptor, args: Record<string, unknown>): Promise<string> {
    const origin = item.value as PromptOrigin | undefined;
    if (origin?.kind === 'mcp') {
      const res = await runTool('mcp_prompt_get', { server: origin.server, name: origin.name, arguments: stringArgs(args) });
      return mcpPromptText(res);
    }
    const res = await runTool('prompt_get', { name: origin?.name ?? item.name, arguments: args });
    return String(res?.text ?? '');
  }

  return { entries, error, savedAvailable, mcpAvailable, canSave, load, render };
}

export type PromptLibraryHandle = ReturnType<typeof usePromptLibrary>;

const stringArgs = (args: Record<string, unknown>): Record<string, string> =>
  Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)]));

/** The text of an MCP `prompts/get` result: its text message parts, joined. */
export function mcpPromptText(result: any): string {
  const messages: any[] = Array.isArray(result?.messages) ? result.messages : [];
  return messages
    .map((m) => (typeof m?.content === 'string' ? m.content : m?.content?.type === 'text' ? String(m.content.text ?? '') : ''))
    .filter(Boolean)
    .join('\n\n');
}
