import { ref, type Ref } from 'vue';
import type { HarnessToolRunner } from './useInterrupts';

/** A conversation message an action runs on. */
export interface HarnessMessageRef {
  text: string;
  role?: 'assistant' | 'user' | 'tool';
  requestId?: string | number | null;
  conversationId?: number | null;
}

export interface MessageActionTool {
  name: string;
  parameters?: { properties?: Record<string, unknown> } | null;
  ui?: { messageAction?: { label: string; icon?: string; appliesTo?: string[] } } | null;
}

/**
 * Arguments for a message action: only the ones the tool declares among `text`, `requestId` and `conversationId`
 * (tool schemas usually forbid extra properties).
 */
export function messageActionArgs(tool: MessageActionTool, message: HarnessMessageRef): Record<string, unknown> {
  const declared = tool.parameters?.properties ?? {};
  const candidates: Record<string, unknown> = {
    text: message.text,
    requestId: message.requestId != null && message.requestId !== '' ? Number(message.requestId) : undefined,
    conversationId: message.conversationId ?? undefined,
  };
  return Object.fromEntries(Object.entries(candidates).filter(([k, v]) => k in declared && v !== undefined && !Number.isNaN(v)));
}

/** Tools offered as actions on messages (`ui.messageAction`), run through the host like any tool call. */
export function useMessageActions(tools: Ref<MessageActionTool[]>, runTool: HarnessToolRunner) {
  const running = ref<string | null>(null);
  const error = ref<string | null>(null);

  function actionsFor(role: HarnessMessageRef['role'] = 'assistant'): MessageActionTool[] {
    return tools.value.filter((t) => {
      const action = t.ui?.messageAction;
      if (!action?.label) return false;
      return (action.appliesTo?.length ? action.appliesTo : ['assistant']).includes(role ?? 'assistant');
    });
  }

  async function run(tool: MessageActionTool, message: HarnessMessageRef): Promise<{ ok: boolean; result?: any }> {
    running.value = tool.name;
    error.value = null;
    try {
      const result = await runTool(tool.name, messageActionArgs(tool, message));
      return { ok: true, result };
    } catch (err: any) {
      error.value = err?.message ?? String(err);
      return { ok: false };
    } finally {
      running.value = null;
    }
  }

  return { running, error, actionsFor, run };
}

export type MessageActionsHandle = ReturnType<typeof useMessageActions>;
