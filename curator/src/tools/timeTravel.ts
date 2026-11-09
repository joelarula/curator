import { defineTool } from './CuratorTool.js';
import { TimeTravelService } from '../engine/TimeTravel.js';
import { actorFromToolContext } from '../services/ManagementGuardService.js';

/**
 * Checkpoints, fork and replay (src/engine/TimeTravel.ts). Project scope comes from the calling session
 * (`toolContext.projectId`), never from arguments.
 */

const sessionProjects = (ctx: Record<string, any>): string[] => (ctx.projectId != null ? [String(ctx.projectId)] : []);

const timeTravelApi = (ctx: Record<string, any>) => {
  const api = ctx.tryService?.(TimeTravelService);
  if (!api) throw new Error('Checkpoints are only available inside a Curator processor');
  return api;
};

export const conversation_checkpoints = defineTool<{ conversationId: number }>({
  name: 'conversation_checkpoints',
  description: "Lists a conversation's state changes as checkpoints (seq, the step that wrote it, changed keys), marking the ones a fork can start after.",
  accessLevel: 'read_only',
  parameters: {
    type: 'object',
    properties: { conversationId: { type: 'integer' } },
    required: ['conversationId'],
    additionalProperties: false,
  },
  execute: async (args, ctx) => ({ checkpoints: await timeTravelApi(ctx).checkpoints(args.conversationId, sessionProjects(ctx)) }),
});

export const conversation_state_at = defineTool<{ conversationId: number; seq?: number }>({
  name: 'conversation_state_at',
  description: 'The conversation state right after checkpoint `seq` (default: now).',
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
      atRequestId: { type: 'integer', description: 'The step to fork after (a forkable checkpoint\'s requestId).' },
      atSeq: { type: 'integer', description: 'Or: the checkpoint seq whose step to fork after.' },
      statePatch: { type: 'object', description: 'Keys merged into state right after the fork point.' },
      scriptVersion: { type: 'integer', description: "Run this version of the root's script; changed steps then run live." },
    },
    required: ['conversationId'],
    additionalProperties: false,
  },
  execute: async (args, ctx) => {
    // A fork runs the workflow live after the fork point: only people start one
    const actor = actorFromToolContext(ctx);
    if (actor.agentId) throw new Error(`conversation_fork is for human callers; agent '${actor.agentId}' cannot fork conversations`);
    if (!actor.userId) throw new Error('conversation_fork needs the calling user');
    return timeTravelApi(ctx).fork({ ...args, userId: actor.userId, projectIds: sessionProjects(ctx) });
  },
});

export const timeTravelTools = { conversation_checkpoints, conversation_state_at, conversation_fork };
