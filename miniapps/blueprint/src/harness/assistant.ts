import type { CuratorHost } from '../../../../packages/host/dist/index.js';
import { ASSISTANT_AGENT } from './assistantPlugin.js';

export interface AssistantReply {
  requestId: number;
  status: string;
  answer: string;
  /** Remote/local tools the agent ran this turn, in order. */
  tools: string[];
}

const DONE = new Set(['COMPLETED', 'FAILED', 'CANCELLED', 'SKIPPED', 'WAITING_FOR_USER']);

/**
 * One chat turn: triggers the assistant agent with the user's message (host API) and waits for its
 * Request to finish. The host processor must be running (`host.start`).
 */
export function createAssistant(host: CuratorHost, options: { timeoutMs?: number; pollMs?: number } = {}) {
  const timeoutMs = options.timeoutMs ?? 180_000;
  const pollMs = options.pollMs ?? 250;

  return {
    async ask(message: string): Promise<AssistantReply> {
      const request = await host.triggerAgent(ASSISTANT_AGENT, { message });
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const current = await host.prisma.request.findUnique({
          where: { id: request.id },
          include: { responses: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
        });
        if (current && DONE.has(current.status)) {
          const contents: string[] = current.responses.map((r: any) => String(r.content ?? ''));
          const tools = contents
            .map((c) => /^\[Tool Result: ([^\]]+)\]/.exec(c)?.[1])
            .filter((t): t is string => Boolean(t));
          const answer = current.status === 'COMPLETED' ? contents.at(-1) ?? '' : contents.at(-1) ?? current.status;
          return { requestId: request.id, status: current.status, answer, tools };
        }
        if (Date.now() > deadline) {
          return { requestId: request.id, status: 'TIMEOUT', answer: `No answer within ${Math.round(timeoutMs / 1000)} s`, tools: [] };
        }
        await new Promise((r) => setTimeout(r, pollMs));
      }
    },
  };
}
