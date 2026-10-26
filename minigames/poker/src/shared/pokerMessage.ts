export enum PokerMessageType {
  HumanAction = 'poker:human_action',
  Speech = 'poker:speech',
  // other prefixed messages can fall back to generic handling
}

export interface PokerMessageContext {
  tableId?: string;
  sessionId?: string;
}

/**
 * Centralized handling of incoming poker‑related messages.
 * Works for both server (WebSocket) and direct (in‑process) channels.
 */
export async function handlePokerMessage(
  msg: any,
  session: import('../session/pokerSession.ts').PokerGameSession,
  ctx: PokerMessageContext
): Promise<void> {
  const { tableId, sessionId } = ctx;
  switch (msg.type) {
    case PokerMessageType.HumanAction:
      await session.submitAction(msg.payload ?? msg.action, { tableId, sessionId });
      break;
    case PokerMessageType.Speech:
      await session.submitSpeech(msg.payload ?? msg, { tableId, sessionId });
      break;
    default:
      if (
        typeof msg.type === 'string' &&
        (msg.type.startsWith('poker:') || msg.type.startsWith('curator:'))
      ) {
        const woken = await session.send(msg.type, msg.payload ?? msg.action, tableId, sessionId);
        if (woken) {
          await session.step(tableId);
        }
      }
      break;
  }
}
