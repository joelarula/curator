/**
 * Per-node fault policies (docs/ENGINE_EVOLUTION_PLAN.md, Phase A): which errors a node retries, how often,
 * with what backoff, and how long one attempt may run (`timeoutMs`). Exhausted or non-retryable failures end the
 * node FAILED, so the usual failure handling applies (`onError`, downstream poisoning / Join).
 */
import type { CuratorRetryPolicy } from './CuratorAst.js';

/** Built-in error classes a `retryOn` list can name; any other entry is a case-insensitive regex on the message. */
export type ErrorClass = 'rate_limit' | 'timeout' | 'transient' | 'tool_error' | 'error';

export const ERROR_CLASSES: readonly ErrorClass[] = ['rate_limit', 'timeout', 'transient', 'tool_error', 'error'];

/** One attempt ran past the node's `timeoutMs`. */
export class NodeTimeoutError extends Error {
  readonly errorClass = 'timeout' as const;
  constructor(readonly timeoutMs: number) {
    super(`Timed out after ${timeoutMs}ms`);
    this.name = 'NodeTimeoutError';
  }
}

/**
 * A tool threw on a node that has a retry policy (without one, tool errors complete the node as `[Tool Error]`).
 * It keeps the class of its cause (a tool hitting a rate limit or a network error is `rate_limit` / `transient`);
 * any other tool failure is `tool_error`.
 */
export class ToolExecutionError extends Error {
  readonly errorClass: ErrorClass;
  constructor(readonly toolName: string, cause: unknown) {
    super(`Tool '${toolName}' failed: ${messageOf(cause)}`);
    this.name = 'ToolExecutionError';
    const causeClass = classifyError(cause);
    this.errorClass = causeClass === 'error' ? 'tool_error' : causeClass;
  }
}

/** Thrown by engine writes from an attempt that was abandoned (timed out): its late results are discarded. */
export class AbandonedAttemptError extends Error {
  constructor(requestId: number) {
    super(`Attempt of request ${requestId} was abandoned (timed out); its writes are discarded`);
    this.name = 'AbandonedAttemptError';
  }
}

const RATE_LIMIT_RE = /\b429\b|quota exceeded|rate.?limit|too many requests|please retry in [\d.]+s/i;
const TRANSIENT_RE = /\b(502|503|504)\b|econnreset|econnrefused|etimedout|eai_again|socket hang up|fetch failed|network error|service unavailable|overloaded/i;
const RETRY_AFTER_RE = /please retry in ([\d.]+)s/i;

export function classifyError(err: unknown): ErrorClass {
  const known = (err as any)?.errorClass;
  if (typeof known === 'string' && (ERROR_CLASSES as readonly string[]).includes(known)) return known as ErrorClass;
  if ((err as any)?.name === 'AbortError' || (err as any)?.name === 'TimeoutError') return 'timeout';
  const msg = messageOf(err);
  if (RATE_LIMIT_RE.test(msg)) return 'rate_limit';
  if (TRANSIENT_RE.test(msg)) return 'transient';
  return 'error';
}

export const messageOf = (err: unknown): string =>
  typeof err === 'string' ? err : (err as any)?.message ?? String(err);

/** Server-suggested delay ("Please retry in 12.3s"), plus a second of slack. */
export function retryAfterMs(err: unknown): number | undefined {
  const m = messageOf(err).match(RETRY_AFTER_RE);
  return m ? parseFloat(m[1]) * 1000 + 1000 : undefined;
}

/** Nodes without a `retry` policy: rate limits only, 5 retries, 5s doubling (the engine's long-standing behaviour). */
export const DEFAULT_RETRY_POLICY: Required<Pick<CuratorRetryPolicy, 'maxAttempts' | 'retryOn'>> & { backoff: Required<NonNullable<CuratorRetryPolicy['backoff']>> } = {
  maxAttempts: 6,
  retryOn: ['rate_limit'],
  backoff: { initialMs: 5000, factor: 2, maxMs: 15 * 60_000, jitter: false },
};

/** `retryOn` of a declared policy that leaves it out. */
export const DEFAULT_RETRY_ON: string[] = ['rate_limit', 'transient', 'timeout'];

function resolvePolicy(policy: CuratorRetryPolicy | undefined) {
  if (!policy) return DEFAULT_RETRY_POLICY;
  return {
    maxAttempts: Math.max(1, Math.floor(policy.maxAttempts ?? 3)),
    retryOn: policy.retryOn ?? DEFAULT_RETRY_ON,
    backoff: {
      initialMs: policy.backoff?.initialMs ?? 1000,
      factor: policy.backoff?.factor ?? 2,
      maxMs: policy.backoff?.maxMs ?? 5 * 60_000,
      jitter: policy.backoff?.jitter ?? true,
    },
  };
}

function matches(retryOn: string[], errorClass: ErrorClass, message: string): boolean {
  return retryOn.some((entry) => {
    if ((ERROR_CLASSES as readonly string[]).includes(entry)) return entry === errorClass;
    try {
      return new RegExp(entry, 'i').test(message);
    } catch {
      return false;
    }
  });
}

export type RetryDecision =
  | { retry: true; errorClass: ErrorClass; delayMs: number; attempt: number; maxAttempts: number }
  | { retry: false; errorClass: ErrorClass; attempt: number; maxAttempts: number; reason: 'not_retryable' | 'exhausted' };

/**
 * Whether a failed attempt runs again. `retryCount` is how many retries already happened (attempt = retryCount + 1).
 * `random` is injectable for deterministic jitter in tests.
 */
export function decideRetry(
  policy: CuratorRetryPolicy | undefined,
  retryCount: number,
  err: unknown,
  random: () => number = Math.random,
): RetryDecision {
  const p = resolvePolicy(policy);
  const errorClass = classifyError(err);
  const attempt = retryCount + 1;
  const base = { errorClass, attempt, maxAttempts: p.maxAttempts };
  if (!matches(p.retryOn, errorClass, messageOf(err))) return { ...base, retry: false, reason: 'not_retryable' };
  if (attempt >= p.maxAttempts) return { ...base, retry: false, reason: 'exhausted' };
  let delayMs = Math.min(p.backoff.maxMs, p.backoff.initialMs * p.backoff.factor ** retryCount);
  if (p.backoff.jitter) delayMs = Math.round(delayMs * (0.5 + random() / 2));
  const hint = retryAfterMs(err);
  if (hint !== undefined) delayMs = Math.max(delayMs, hint);
  return { ...base, retry: true, delayMs };
}
