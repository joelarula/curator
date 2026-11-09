/**
 * Structured pause/resume (docs/ENGINE_EVOLUTION_PLAN.md, Phase B): every wait a human or client resolves (human
 * input, tool approval, event wait) parks with one envelope, `context.__interrupt`, and is resumed through one
 * entry point (`conversation_resume` / `CuratorRequestProcessor.resumeInterrupt`) with a value checked against the
 * interrupt's `resumeSchema`. Only what no other key holds is stored (`StoredInterrupt`); prompt, choices, tool call,
 * event names, target user and deadline are read from the wait's own keys (`choicePrompt`, `activeChoices`,
 * `pendingToolCall`, `waitEvent(s)`, `targetUserId`, `waitDeadline`) when the interrupt is described.
 */
import { SecretService } from '../services/SecretService.js';
import AjvModule from 'ajv';
import { defineService } from './nodes/NodeHandler.js';
import type { ApprovalScope } from '../services/ApprovalService.js';

const Ajv = (AjvModule as any).default || AjvModule;
const ajv = new Ajv({ allErrors: true, strict: false });

/** Context key holding the open interrupt of a parked Request. */
export const INTERRUPT_KEY = '__interrupt';
/** Internal announcement of an opened interrupt (`ctx.emit`); the processor publishes it as a `wait.opened` progress event. */
export const INTERRUPT_OPENED = 'curator:interrupt';
/** Context key counting interrupts a Request has opened (ids stay unique across re-parks). */
export const INTERRUPT_SEQ_KEY = '__interruptSeq';

export type InterruptKind = 'human_input' | 'approval' | 'event';

export interface CuratorInterrupt {
  /** Envelope version. */
  v: 1;
  /** `<requestId>.<n>`: a resume naming an older interrupt of the same Request is refused. */
  id: string;
  kind: InterruptKind;
  requestId: number;
  conversationId: number;
  projectId: string | null;
  prompt?: string;
  /** What a client shows: choices and inputType (human_input), tool/args/reason (approval), eventNames (event). */
  payload?: Record<string, any>;
  /** JSON Schema the resume value must satisfy (absent: any value). */
  resumeSchema?: Record<string, any>;
  /** Only this user may resume. */
  targetUserId?: string | null;
  /** ISO time the wait expires. */
  deadline?: string;
  createdAt: string;
}

/** Resume value of an approval interrupt. */
export interface ApprovalResume {
  approved: boolean;
  scope?: ApprovalScope;
  reason?: string;
}

export const APPROVAL_RESUME_SCHEMA = {
  type: 'object',
  properties: {
    approved: { type: 'boolean' },
    scope: { enum: ['ONETIME', 'CONVERSATION', 'PERMANENT'] },
    reason: { type: 'string' },
  },
  required: ['approved'],
  additionalProperties: false,
} as const;

/** The part of an interrupt stored in the parked request's context (the rest is derived, see `describeInterrupt`). */
export interface StoredInterrupt {
  v: 1;
  id: string;
  kind: InterruptKind;
  createdAt: string;
  resumeSchema?: Record<string, any>;
  /** human_input: the prompt's input type (not kept elsewhere in the context). */
  inputType?: string;
}

/**
 * Builds the next interrupt for `req`: the full envelope (to announce) and the context keys that store it (merge them
 * into the parked context, next to the wait's own keys the envelope is described from).
 */
export function openInterrupt(
  req: { id: number; conversationId: number; projectId?: string | null; context?: any },
  spec: Omit<CuratorInterrupt, 'v' | 'id' | 'requestId' | 'conversationId' | 'projectId' | 'createdAt'>,
  now: number,
): { interrupt: CuratorInterrupt; context: Record<string, any> } {
  const seq = (Number(req.context?.[INTERRUPT_SEQ_KEY]) || 0) + 1;
  const stored: StoredInterrupt = {
    v: 1,
    id: `${req.id}.${seq}`,
    kind: spec.kind,
    createdAt: new Date(now).toISOString(),
    // Approvals always use APPROVAL_RESUME_SCHEMA (supplied when described)
    ...(spec.resumeSchema && spec.kind !== 'approval' ? { resumeSchema: spec.resumeSchema } : {}),
    ...(spec.kind === 'human_input' && spec.payload?.inputType ? { inputType: spec.payload.inputType } : {}),
  };
  const interrupt: CuratorInterrupt = {
    ...stored,
    requestId: req.id,
    conversationId: req.conversationId,
    projectId: req.projectId ?? null,
    ...Object.fromEntries(Object.entries(spec).filter(([, v]) => v !== undefined)),
  } as CuratorInterrupt;
  delete (interrupt as any).inputType;
  return { interrupt, context: { [INTERRUPT_KEY]: stored, [INTERRUPT_SEQ_KEY]: seq } };
}

/** The full envelope of the interrupt a parked request stores, from its stored part and the wait's own keys. */
export function describeInterrupt(
  req: { id: number; conversationId: number; projectId?: string | null },
  ctx: Record<string, any>,
): CuratorInterrupt | undefined {
  const stored: StoredInterrupt | undefined = ctx?.[INTERRUPT_KEY];
  if (!stored?.id || !stored.kind) return undefined;
  const base = {
    v: 1 as const,
    id: stored.id,
    kind: stored.kind,
    requestId: req.id,
    conversationId: req.conversationId,
    projectId: req.projectId ?? null,
    createdAt: stored.createdAt,
    ...(stored.resumeSchema ? { resumeSchema: stored.resumeSchema } : {}),
  };
  if (stored.kind === 'approval') {
    const pending = ctx.pendingToolCall ?? {};
    return {
      ...base,
      resumeSchema: base.resumeSchema ?? (APPROVAL_RESUME_SCHEMA as any),
      prompt: `Approve tool '${pending.name}'?`,
      payload: { tool: pending.name, args: SecretService.sanitizeContext(pending.args ?? {}), reason: ctx.reason },
      ...(pending.expiresAt ? { deadline: pending.expiresAt } : {}),
    };
  }
  if (stored.kind === 'event') {
    const eventNames = Array.isArray(ctx.waitEvents) && ctx.waitEvents.length ? ctx.waitEvents : ctx.waitEvent ? [ctx.waitEvent] : [];
    return { ...base, payload: { eventNames }, ...(ctx.waitDeadline ? { deadline: ctx.waitDeadline } : {}) };
  }
  return {
    ...base,
    ...(typeof ctx.choicePrompt === 'string' ? { prompt: ctx.choicePrompt } : {}),
    payload: { inputType: stored.inputType ?? 'choices', choices: ctx.activeChoices ?? [] },
    targetUserId: ctx.targetUserId ?? null,
    ...(ctx.waitDeadline ? { deadline: ctx.waitDeadline } : {}),
  };
}

/** Request id named by an interrupt id, or null when malformed. */
export function interruptRequestId(interruptId: string): number | null {
  const m = /^(\d+)\.\d+$/.exec(String(interruptId ?? ''));
  return m ? Number(m[1]) : null;
}

/** Checks a resume value against the interrupt's schema; returns error messages (empty when valid). */
export function validateResumeValue(interrupt: CuratorInterrupt, value: unknown): string[] {
  if (!interrupt.resumeSchema) return [];
  try {
    const validate = ajv.compile(interrupt.resumeSchema);
    if (validate(value)) return [];
    return (validate.errors || []).map((e: any) => `${e.instancePath || '/'} ${e.message || 'invalid'}`.trim());
  } catch (err: any) {
    return [`resumeSchema does not compile: ${err.message}`];
  }
}

export interface ListInterruptsFilter {
  /** Projects the caller may read (from the host session, never from client payloads). */
  projectIds: string[];
  conversationId?: number;
  kind?: InterruptKind;
}

export interface ResumeInterruptInput {
  interruptId: string;
  value: unknown;
  /** The human resuming (checked against `targetUserId`, recorded as approver). */
  userId: string;
  /** Projects the caller may write (from the host session). */
  projectIds: string[];
}

export interface ResumeInterruptResult {
  interruptId: string;
  requestId: number;
  kind: InterruptKind;
  /** 'resumed' (the flow continues) or, for a denied approval, 'denied'. */
  outcome: 'resumed' | 'denied';
}

/** Processor API behind the interrupt tools (provided by every CuratorRequestProcessor). */
export interface InterruptApi {
  list(filter: ListInterruptsFilter): Promise<CuratorInterrupt[]>;
  resume(input: ResumeInterruptInput): Promise<ResumeInterruptResult>;
}

export const InterruptService = defineService<InterruptApi>('curator.interrupts');
