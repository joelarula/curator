import { defineTool } from './CuratorTool.js';
import { TimeTravelService } from '../engine/TimeTravel.js';
import { requireHumanCaller, sessionProjects } from './sessionScope.js';

/**
 * State history, fork and replay (src/engine/TimeTravel.ts). Project scope comes from the calling session
 * (`toolContext.projectId`), never from arguments.
 */

const timeTravelApi = (ctx: Record<string, any>) => {
  const api = ctx.tryService?.(TimeTravelService);
  if (!api) throw new Error('State history is only available inside a Curator processor');
  return api;
};

export const conversation_state_history = defineTool<{ conversationId: number }>({
  name: 'conversation_state_history',
  description: "Lists a conversation's state changes (seq, the step that wrote it, changed keys), marking the ones a fork can start after.",
  accessLevel: 'read_only',
  parameters: {
    type: 'object',
    properties: { conversationId: { type: 'integer' } },
    required: ['conversationId'],
    additionalProperties: false,
  },
  execute: async (args, ctx) => ({ history: await timeTravelApi(ctx).history(args.conversationId, sessionProjects(ctx)) }),
});

export const conversation_state_at = defineTool<{ conversationId: number; seq?: number }>({
  name: 'conversation_state_at',
  description: 'The conversation state right after state change `seq` (default: now).',
  accessLevel: 'read_only',
  parameters: {
    type: 'object',
    properties: { conversationId: { type: 'integer' }, seq: { type: 'integer', minimum: 1 } },
    required: ['conversationId'],
    additionalProperties: false,
  },
  execute: async (args, ctx) => ({ state: await timeTravelApi(ctx).stateAt(args.conversationId, args.seq, sessionProjects(ctx)) }),
});

export const conversation_fork = defineTool<{ conversationId: number; atRequestId?: number; atSeq?: number; statePatch?: Record<string, any>; scriptVersion?: number }>({
  name: 'conversation_fork',
  description: "Forks a conversation right after a finished step: a new conversation replays the recorded steps up to it (no tool calls, model calls or prompts repeat), merges statePatch into state there, then runs live. The original is unchanged. Human callers only.",
  accessLevel: 'safe_write',
  parameters: {
    type: 'object',
    properties: {
      conversationId: { type: 'integer' },
      atRequestId: { type: 'integer', description: "The step to fork after (a forkable history entry's requestId)." },
      atSeq: { type: 'integer', description: 'Or: the state change seq whose step to fork after.' },
      statePatch: { type: 'object', description: 'Keys merged into state right after the fork point.' },
      scriptVersion: { type: 'integer', description: "Run this version of the root's script; changed steps then run live." },
    },
    required: ['conversationId'],
    additionalProperties: false,
  },
  execute: async (args, ctx) => {
    // A fork runs the workflow live after the fork point: only people start one
    const userId = requireHumanCaller(ctx, 'conversation_fork');
    return timeTravelApi(ctx).fork({ ...args, userId, projectIds: sessionProjects(ctx) });
  },
});

export const timeTravelTools = { conversation_state_history, conversation_state_at, conversation_fork };
