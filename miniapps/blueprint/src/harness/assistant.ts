import type { CuratorHost } from '@curator/host';
import { ASSISTANT_AGENT } from './assistantPlugin.js';

export interface AssistantReply {
  requestId: number;
  status: string;
  answer: string;
  /** Remote/local tools the agent ran this turn, in order. */
  tools: string[];
  /** Display form of the tool results that have one (tool output rules), in order. */
  shown: { tool: string; display: string }[];
}

const DONE = new Set(['COMPLETED', 'FAILED', 'CANCELLED', 'SKIPPED', 'WAITING_FOR_USER']);

/**
 * One chat turn: triggers the assistant agent with the user's message (host API) and waits for its
 * Request to finish. The host processor must be running (`host.start`).
 */
export function createAssistant(
  host: CuratorHost,
  options: { timeoutMs?: number; pollMs?: number; conversationId?: number } = {}
) {
  const timeoutMs = options.timeoutMs ?? 180_000;
  const pollMs = options.pollMs ?? 250;
  let conversationId = options.conversationId;
  /** History profile sent with each turn ('full' | 'answers'); undefined = the agent's default. */
  let historyProfile: string | undefined;

  async function waitForReply(requestId: number, shown: () => AssistantReply['shown']): Promise<AssistantReply> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const current = await host.prisma.request.findUnique({
        where: { id: requestId },
        include: { responses: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
      });
      if (current && DONE.has(current.status)) {
        const contents: string[] = current.responses.map((r: any) => String(r.content ?? ''));
        const tools = contents
          .map((c) => /^\[Tool Result: ([^\]]+)\]/.exec(c)?.[1])
          .filter((t): t is string => Boolean(t));
        const answer = current.status === 'COMPLETED' ? contents.at(-1) ?? '' : contents.at(-1) ?? current.status;
        return { requestId, status: current.status, answer, tools, shown: shown() };
      }
      if (Date.now() > deadline) {
        return { requestId, status: 'TIMEOUT', answer: `No answer within ${Math.round(timeoutMs / 1000)} s`, tools: [], shown: shown() };
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
  }

  return {
    /** The chat (Conversation) turns go to; undefined = the host conversation. */
    get conversationId() {
      return conversationId;
    },
    useConversation(id: number | undefined) {
      conversationId = id;
    },
    get historyProfile() {
      return historyProfile;
    },
    useHistoryProfile(profile: string | undefined) {
      historyProfile = profile;
    },
    async ask(message: string): Promise<AssistantReply> {
      // Subscribed before the trigger: the agent may run its tools before triggerAgent returns.
      const displayed: { requestId: number; tool: string; display: string }[] = [];
      const unsubscribe = host.events.onEvent((event) => {
        if (event.type === 'agent:tool_result') displayed.push(event.payload);
      });
      try {
        const context = historyProfile ? { message, history: historyProfile } : { message };
        const request = await host.triggerAgent(ASSISTANT_AGENT, context, { conversationId });
        const shown = () => displayed.filter((d) => d.requestId === request.id).map(({ tool, display }) => ({ tool, display }));
        return await waitForReply(request.id, shown);
      } finally {
        unsubscribe();
      }
    },
  };
}
