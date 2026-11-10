import { computed, ref, type Ref } from 'vue';
import type { HarnessToolRunner } from './useInterrupts';

/** One conversation as `conversation_list` describes it. */
export interface ConversationView {
  conversationId: number;
  externalId: string;
  title: string;
  /** False when the title is the first message (no title set). */
  titled: boolean;
  pinned: boolean;
  archived: boolean;
  /** False for a channel the user is a member of (not its owner). */
  owned?: boolean;
  memberCount?: number;
  createdAt: string;
  lastActiveAt: string;
}

/** An open channel of the project as `channel_list` describes it. */
export interface ChannelView {
  conversationId: number;
  externalId: string;
  title: string;
  memberCount: number;
  joined: boolean;
  owned: boolean;
}

/** How long to wait before reloading after a join / leave request (the workflow handles it asynchronously). */
export const CHANNEL_SETTLE_MS = 600;

const LIST = 'conversation_list';

/**
 * Conversation organisation through the conversation tools (`conversation_list`, `_rename`, `_pin`, `_archive`,
 * `_delete`): the caller's conversations in the project, pinned first. Offered only when the user may list them.
 */
export function useConversations(tools: Ref<any[]>, runTool: HarnessToolRunner) {
  const conversations = ref<ConversationView[]>([]);
  const showArchived = ref(false);
  const query = ref('');
  const loading = ref(false);
  const busyId = ref<number | null>(null);
  const error = ref<string | null>(null);
  const toolNames = computed(() => new Set(tools.value.map((t: any) => t?.name)));
  const available = computed(() => toolNames.value.has(LIST));
  const can = (verb: 'rename' | 'pin' | 'archive' | 'delete') => toolNames.value.has(`conversation_${verb}`);
  const channels = ref<ChannelView[]>([]);
  const channelsAvailable = computed(() => toolNames.value.has('channel_list') && toolNames.value.has('channel_request'));
  /** Join / leave requests sent and not yet settled, by conversation id. */
  const requesting = ref<number | null>(null);

  async function load(): Promise<void> {
    if (!available.value) {
      conversations.value = [];
      return;
    }
    loading.value = true;
    try {
      const res = await runTool(LIST, { archived: showArchived.value, ...(query.value.trim() ? { query: query.value.trim() } : {}) });
      conversations.value = Array.isArray(res?.conversations) ? res.conversations : [];
      error.value = null;
    } catch (err: any) {
      error.value = err?.message ?? String(err);
    } finally {
      loading.value = false;
    }
  }

  /** Runs one organising tool on a conversation, then reloads the list. */
  async function act(conversationId: number, tool: string, args: Record<string, unknown> = {}): Promise<boolean> {
    busyId.value = conversationId;
    try {
      await runTool(tool, { conversationId, ...args });
      error.value = null;
      await load();
      return true;
    } catch (err: any) {
      error.value = err?.message ?? String(err);
      return false;
    } finally {
      busyId.value = null;
    }
  }

  async function loadChannels(): Promise<void> {
    if (!channelsAvailable.value) {
      channels.value = [];
      return;
    }
    try {
      const res = await runTool('channel_list', {});
      channels.value = Array.isArray(res?.channels) ? res.channels : [];
    } catch (err: any) {
      error.value = err?.message ?? String(err);
    }
  }

  /**
   * Asks a channel's workflow to let the user join or leave (`channel_request`); the workflow decides, so both lists
   * are reloaded once it had time to handle the request.
   */
  async function request(conversationId: number, action: 'join' | 'leave', settleMs = CHANNEL_SETTLE_MS): Promise<boolean> {
    requesting.value = conversationId;
    try {
      await runTool('channel_request', { conversationId, action });
      error.value = null;
      if (settleMs > 0) await new Promise((r) => setTimeout(r, settleMs));
      await Promise.all([load(), loadChannels()]);
      return true;
    } catch (err: any) {
      error.value = err?.message ?? String(err);
      return false;
    } finally {
      requesting.value = null;
    }
  }

  const rename = (id: number, title: string) => act(id, 'conversation_rename', { title });
  const setPinned = (id: number, pinned: boolean) => act(id, 'conversation_pin', { pinned });
  const setArchived = (id: number, archived: boolean) => act(id, 'conversation_archive', { archived });
  const remove = (id: number) => act(id, 'conversation_delete');

  async function toggleArchived(): Promise<void> {
    showArchived.value = !showArchived.value;
    await load();
  }

  return {
    conversations,
    showArchived,
    query,
    loading,
    busyId,
    error,
    available,
    can,
    load,
    rename,
    setPinned,
    setArchived,
    remove,
    toggleArchived,
    channels,
    channelsAvailable,
    requesting,
    loadChannels,
    request,
  };
}

export type ConversationsHandle = ReturnType<typeof useConversations>;
