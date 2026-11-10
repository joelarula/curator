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
  createdAt: string;
  lastActiveAt: string;
}

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

  const rename = (id: number, title: string) => act(id, 'conversation_rename', { title });
  const setPinned = (id: number, pinned: boolean) => act(id, 'conversation_pin', { pinned });
  const setArchived = (id: number, archived: boolean) => act(id, 'conversation_archive', { archived });
  const remove = (id: number) => act(id, 'conversation_delete');

  async function toggleArchived(): Promise<void> {
    showArchived.value = !showArchived.value;
    await load();
  }

  return { conversations, showArchived, query, loading, busyId, error, available, can, load, rename, setPinned, setArchived, remove, toggleArchived };
}

export type ConversationsHandle = ReturnType<typeof useConversations>;
