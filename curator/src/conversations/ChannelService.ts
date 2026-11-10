import { defineService } from '../engine/nodes/NodeHandler.js';

/** What a person asks a channel's workflow for. */
export type ChannelRequestAction = 'join' | 'leave';

export const CHANNEL_REQUEST_EVENTS: Record<ChannelRequestAction, string> = {
  join: 'conversation:join_requested',
  leave: 'conversation:leave_requested',
};

/**
 * Processor API behind `channel_request`: sends a join / leave request event into a conversation, with the caller as
 * the sender (`context.emittedBy`). The conversation's workflow decides; this never adds or removes members itself.
 */
export interface ChannelApi {
  request(input: { conversationId: number; action: ChannelRequestAction; userId: string; projectId: string | null }): Promise<{ requestId: number }>;
}

export const ChannelService = defineService<ChannelApi>('curator.channels');
