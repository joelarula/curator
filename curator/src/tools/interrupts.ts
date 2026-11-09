import { defineTool } from './CuratorTool.js';
import { InterruptService, type InterruptKind } from '../engine/Interrupts.js';
import { actorFromToolContext } from '../services/ManagementGuardService.js';

/**
 * Structured pause/resume (src/engine/Interrupts.ts): list the waits a human or client must resolve, and resume one
 * with a typed value. Project scope comes from the calling session (`toolContext.projectId`), never from arguments.
 */

const sessionProjects = (ctx: Record<string, any>): string[] => (ctx.projectId != null ? [String(ctx.projectId)] : []);

const interruptApi = (ctx: Record<string, any>) => {
  const api = ctx.tryService?.(InterruptService);
  if (!api) throw new Error('Interrupts are only available inside a Curator processor');
  return api;
};

export const conversation_interrupts = defineTool<{ conversationId?: number; kind?: InterruptKind }>({
  name: 'conversation_interrupts',
  description: 'Lists open interrupts (human prompts, tool approvals, event waits) in the active project, each with its id, kind, prompt, payload and the JSON Schema of the value that resumes it.',
  accessLevel: 'read_only',
  parameters: {
    type: 'object',
    properties: {
      conversationId: { type: 'integer', description: 'Only this conversation (default: all conversations of this processor).' },
      kind: { type: 'string', enum: ['human_input', 'approval', 'event'] },
    },
    additionalProperties: false,
  },
  execute: async (args, ctx) => {
    const interrupts = await interruptApi(ctx).list({ projectIds: sessionProjects(ctx), conversationId: args.conversationId, kind: args.kind });
    return { interrupts };
  },
});

export const conversation_resume = defineTool<{ interruptId: string; value?: unknown }>({
  name: 'conversation_resume',
  description: 'Resumes an open interrupt with a value matching its resumeSchema: the answer to a prompt, the payload of an awaited event, or { approved, scope?, reason? } for a tool approval. Human callers only.',
  accessLevel: 'safe_write',
  parameters: {
    type: 'object',
    properties: {
      interruptId: { type: 'string', pattern: '^\\d+\\.\\d+$', description: "The interrupt id ('<requestId>.<n>') from conversation_interrupts." },
      value: { description: 'The resume value; validated against the interrupt\'s resumeSchema.' },
    },
    required: ['interruptId'],
    additionalProperties: false,
  },
  execute: async (args, ctx) => {
    // An agent must never answer a human prompt or approve a gated tool call (its own included)
    const actor = actorFromToolContext(ctx);
    if (actor.agentId) throw new Error(`conversation_resume is for human callers; agent '${actor.agentId}' cannot resume interrupts`);
    if (!actor.userId) throw new Error('conversation_resume needs the calling user');
    return interruptApi(ctx).resume({ interruptId: args.interruptId, value: args.value, userId: actor.userId, projectIds: sessionProjects(ctx) });
  },
});

export const interruptTools = { conversation_interrupts, conversation_resume };
