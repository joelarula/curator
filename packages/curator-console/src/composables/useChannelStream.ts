import { computed, getCurrentScope, onScopeDispose, ref, type Ref } from 'vue';
import type { HarnessToolRunner } from './useInterrupts';

/** One channel message as `channel_messages` returns it. */
export interface ChannelMessage {
  id: number;
  text: string;
  sender: { type: 'user' | 'agent'; id: string; name?: string | null } | null;
  at: string;
}

/** How often an open channel checks for new messages. */
export const CHANNEL_POLL_MS = 3000;

/**
 * The shared message stream of one channel: the latest messages, new ones by polling (`channel_messages` after the
 * last id) and posting (`channel_post`). Offered only when the user may run both tools.
 */
export function useChannelStream(tools: Ref<any[]>, runTool: HarnessToolRunner, options: { pollMs?: number } = {}) {
  const conversationId = ref<number | null>(null);
  const title = ref('');
  const messages = ref<ChannelMessage[]>([]);
  const error = ref<string | null>(null);
  const posting = ref(false);
  const toolNames = computed(() => new Set(tools.value.map((t: any) => t?.name)));
  const available = computed(() => toolNames.value.has('channel_messages') && toolNames.value.has('channel_post'));
  let timer: ReturnType<typeof setInterval> | null = null;

  const lastId = () => (messages.value.length ? messages.value[messages.value.length - 1].id : undefined);

  /** Fetches messages newer than the last one shown (all latest ones when none is shown). */
  async function refresh(): Promise<void> {
    const id = conversationId.value;
    if (id == null) return;
    try {
      const after = lastId();
      const res = await runTool('channel_messages', { conversationId: id, ...(after !== undefined ? { afterId: after } : {}) });
      if (conversationId.value !== id) return;
      const fresh: ChannelMessage[] = Array.isArray(res?.messages) ? res.messages : [];
      const seen = new Set(messages.value.map((m) => m.id));
      messages.value = [...messages.value, ...fresh.filter((m) => !seen.has(m.id))];
      error.value = null;
    } catch (err: any) {
      error.value = err?.message ?? String(err);
    }
  }

  function stopPolling() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  async function open(id: number, channelTitle = ''): Promise<void> {
    stopPolling();
    conversationId.value = id;
    title.value = channelTitle;
    messages.value = [];
    await refresh();
    const every = options.pollMs ?? CHANNEL_POLL_MS;
    if (every > 0) timer = setInterval(refresh, every);
  }

  function close(): void {
    stopPolling();
    conversationId.value = null;
    messages.value = [];
    error.value = null;
  }

  async function post(text: string): Promise<boolean> {
    const id = conversationId.value;
    const body = text.trim();
    if (id == null || !body) return false;
    posting.value = true;
    try {
      await runTool('channel_post', { conversationId: id, text: body });
      await refresh();
      return true;
    } catch (err: any) {
      error.value = err?.message ?? String(err);
      return false;
    } finally {
      posting.value = false;
    }
  }

  if (getCurrentScope()) onScopeDispose(stopPolling);

  return { conversationId, title, messages, error, posting, available, open, close, refresh, post };
}

export type ChannelStreamHandle = ReturnType<typeof useChannelStream>;
