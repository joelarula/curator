import { defineService } from '../engine/nodes/NodeHandler.js';

/** What a person asks a channel's workflow for. */
export type ChannelRequestAction = 'join' | 'leave' | 'invite';

export const CHANNEL_REQUEST_EVENTS: Record<ChannelRequestAction, string> = {
  join: 'conversation:join_requested',
  leave: 'conversation:leave_requested',
  invite: 'conversation:invite_requested',
};

/**
 * Processor API behind `channel_request`: sends a join / leave request event into a conversation, with the caller as
 * the sender (`context.emittedBy`). The conversation's workflow decides; this never adds or removes members itself.
 */
export interface ChannelApi {
  /** `payload`: what the request is about (invite: `{ userId }` or `{ agentId }` of the invitee). */
  request(input: { conversationId: number; action: ChannelRequestAction; userId: string; projectId: string | null; payload?: Record<string, unknown> }): Promise<{ requestId: number }>;
  /** Posts a message into a channel as the caller: event `conversation:message` (agents' workflows may react). */
  post(input: { conversationId: number; userId: string; projectId: string | null; payload: ChannelMessagePayload }): Promise<{ requestId: number }>;
}

/** Event of a channel message; `sender` is set by the posting tool from the session, never by the client. */
export const CHANNEL_MESSAGE_EVENT = 'conversation:message';

export interface ChannelMessagePayload {
  text: string;
  sender: { type: 'user' | 'agent'; id: string; name?: string | null };
}

export const ChannelService = defineService<ChannelApi>('curator.channels');
