import { computed, ref, type Ref } from 'vue';
import type { CommandDescriptor } from '@curator/host/contracts';
import type { HarnessToolRunner } from './useInterrupts';

/** A resource picked with `#` in the composer, attached to the next turn. */
export interface HarnessAttachment {
  uri: string;
  title: string;
  id?: number;
}

/** What `attach_resource` returned for one attachment. */
export interface AttachedResource extends HarnessAttachment {
  excerpt: string;
}

const SEARCH_TOOL = 'search_resources';
const ATTACH_TOOL = 'attach_resource';
const SEARCH_DELAY_MS = 200;

/**
 * `#` attachments: resource suggestions (`search_resources`), the picked chips, and on send `attach_resource` for each
 * (links it to the conversation and returns an excerpt). Offered only when the user may run both tools (the tool
 * list is already filtered by role).
 */
export function useAttachments(tools: Ref<any[]>, runTool: HarnessToolRunner) {
  const attachments = ref<HarnessAttachment[]>([]);
  /** Search results for the current `#query`, as composer entries (`source: 'resource'`). */
  const hits = ref<CommandDescriptor[]>([]);
  const error = ref<string | null>(null);
  const available = computed(() => {
    const names = new Set(tools.value.map((t: any) => t?.name));
    return names.has(SEARCH_TOOL) && names.has(ATTACH_TOOL);
  });

  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastQuery: string | null = null;
  let seq = 0;

  /** Searches resources for `query` (debounced; the latest query wins). */
  function search(query: string) {
    if (!available.value) {
      hits.value = [];
      return;
    }
    if (query === lastQuery) return;
    lastQuery = query;
    if (timer) clearTimeout(timer);
    const mine = ++seq;
    timer = setTimeout(async () => {
      try {
        const res = await runTool(SEARCH_TOOL, { ...(query ? { query } : {}), limit: 8 });
        if (mine !== seq) return;
        const rows: any[] = Array.isArray(res?.resources) ? res.resources : Array.isArray(res?.items) ? res.items : [];
        hits.value = rows
          .filter((r) => r && typeof r.uri === 'string')
          .map((r) => ({
            name: String(r.title || r.uri),
            source: 'resource' as const,
            title: r.title && r.title !== r.uri ? r.uri : undefined,
            description: r.description || undefined,
            icon: 'mdi-paperclip',
            value: { uri: r.uri, title: String(r.title || r.uri), id: typeof r.id === 'number' ? r.id : undefined },
          }));
        error.value = null;
      } catch (err: any) {
        if (mine === seq) {
          hits.value = [];
          error.value = err?.message ?? String(err);
        }
      }
    }, SEARCH_DELAY_MS);
  }

  function resetSearch() {
    lastQuery = null;
    hits.value = [];
  }

  function add(attachment: HarnessAttachment) {
    if (!attachments.value.some((a) => a.uri === attachment.uri)) attachments.value = [...attachments.value, attachment];
  }

  function remove(index: number) {
    attachments.value = attachments.value.filter((_, i) => i !== index);
  }

  function clear() {
    attachments.value = [];
  }

  /**
   * Attaches every chip to the conversation (`attach_resource`) and returns what was attached. Chips are cleared
   * once sent; one that cannot be attached is reported in `error` and left out.
   */
  async function attachAll(): Promise<AttachedResource[]> {
    const out: AttachedResource[] = [];
    const failed: string[] = [];
    for (const a of attachments.value) {
      try {
        const res = await runTool(ATTACH_TOOL, a.id !== undefined ? { id: a.id } : { uri: a.uri });
        if (res?.attached) {
          out.push({ uri: res.resource?.uri ?? a.uri, title: res.resource?.title ?? a.title, id: res.resource?.id ?? a.id, excerpt: String(res.excerpt ?? '') });
        } else {
          failed.push(a.title);
        }
      } catch {
        failed.push(a.title);
      }
    }
    error.value = failed.length ? `Could not attach: ${failed.join(', ')}` : null;
    clear();
    return out;
  }

  return { attachments, hits, error, available, search, resetSearch, add, remove, clear, attachAll };
}

export type AttachmentsHandle = ReturnType<typeof useAttachments>;

/** The prompt with an "Attached" block: title, URI and excerpt of each attached resource. */
export function promptWithAttachments(prompt: string, attached: readonly AttachedResource[]): string {
  if (attached.length === 0) return prompt;
  const blocks = attached.map((a) => [`### ${a.title} (${a.uri})`, a.excerpt].filter(Boolean).join('\n'));
  return [prompt, '', 'Attached:', ...blocks].join('\n');
}
