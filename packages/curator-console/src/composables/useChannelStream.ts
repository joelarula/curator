import { computed, getCurrentScope, onScopeDispose, ref, type Ref } from 'vue';
import type { HarnessToolRunner } from './useInterrupts';

/** One channel message as `channel_messages` returns it. */
export interface ChannelMessage {
  id: number;
  text: string;
  sender: { type: 'user' | 'agent'; id: string; name?: string | null } | null;
  at: string;
}

/** Without a live feed only: how often an open channel checks for new messages. */
export const CHANNEL_POLL_MS = 3000;

/** Host event subscription (e.g. `adapter.onProgress`): `(type, payload)` for every event this client receives. */
export type ChannelEventSubscribe = (callback: (type: string, payload: any) => void) => () => void;

/**
 * The shared message stream of one channel: the latest messages, live ones as the channel workflow delivers them to
 * this user (`conversation:message_delivered`, addressed: only members receive it), polling (`channel_messages` after
 * the last id) to catch up, and posting (`channel_post`). Offered only when the user may run both tools.
 */
export function useChannelStream(
  tools: Ref<any[]>,
  runTool: HarnessToolRunner,
  options: { pollMs?: number; subscribe?: ChannelEventSubscribe } = {}
) {
  const conversationId = ref<number | null>(null);
  const title = ref('');
  const messages = ref<ChannelMessage[]>([]);
  const error = ref<string | null>(null);
  const posting = ref(false);
  const toolNames = computed(() => new Set(tools.value.map((t: any) => t?.name)));
  const available = computed(() => toolNames.value.has('channel_messages') && toolNames.value.has('channel_post'));
  let timer: ReturnType<typeof setInterval> | null = null;

  const lastId = () => (messages.value.length ? messages.value[messages.value.length - 1].id : undefined);

  /** Adds messages not shown yet (live and polled copies share the stored message id), in id order. */
  function merge(fresh: ChannelMessage[]) {
    const seen = new Set(messages.value.map((m) => m.id));
    const added = fresh.filter((m) => typeof m?.id === 'number' && !seen.has(m.id));
    if (added.length) messages.value = [...messages.value, ...added].sort((a, b) => a.id - b.id);
  }

  // Live feed (WebSocket): deliveries for the open channel; after a (re)connect, fetch once what was missed meanwhile
  const unsubscribe = options.subscribe?.((type, payload) => {
    if (type === 'connected') {
      if (conversationId.value != null) void refresh();
      return;
    }
    if (type !== 'conversation:message_delivered' || payload == null) return;
    if (conversationId.value == null || Number(payload.conversationId) !== conversationId.value) return;
    merge([{ id: Number(payload.id), text: String(payload.text ?? ''), sender: payload.sender ?? null, at: new Date().toISOString() }]);
  });

  /** Fetches messages newer than the last one shown (all latest ones when none is shown). */
  async function refresh(): Promise<void> {
    const id = conversationId.value;
    if (id == null) return;
    try {
      const after = lastId();
      const res = await runTool('channel_messages', { conversationId: id, ...(after !== undefined ? { afterId: after } : {}) });
      if (conversationId.value !== id) return;
      merge(Array.isArray(res?.messages) ? res.messages : []);
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
    // With a live feed there is no timer: messages arrive over the socket, gaps are fetched on reconnect
    const every = options.pollMs ?? (options.subscribe ? 0 : CHANNEL_POLL_MS);
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

  if (getCurrentScope()) {
    onScopeDispose(() => {
      stopPolling();
      unsubscribe?.();
    });
  }

  return { conversationId, title, messages, error, posting, available, open, close, refresh, post };
}

export type ChannelStreamHandle = ReturnType<typeof useChannelStream>;
