import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { LlmRequest, LlmResponse } from './ILlmProvider.js';
import { logger } from '../../utils/logger.js';

/**
 * Debug trace of what is actually sent to an LLM: the request as sent and the response (or error), per call.
 * Off by default; two sinks, each turned on separately:
 * - `CURATOR_LLM_TRACE=<dir>`: one file per call, `<dir>/<conversationId>/<requestId>-<turn>.json`.
 * - the `LlmCall` table: processor option `llmCalls` (or `CURATOR_LLM_TRACE_DB=1`), passed in as `sink`.
 * Records hold system prompts and tool output (secrets masked), so keep them off outside debugging.
 */
export interface LlmTraceKey {
  conversationId: number;
  requestId: number;
  projectId?: string | null;
  userId?: string | null;
  /** Agentic loop iteration, or a label such as 'summary'. */
  turn: number | string;
  provider?: string;
}

/** An `LlmCall` row. */
export interface LlmCallRecord {
  createdAt: Date;
  conversationId: number;
  requestId: number;
  projectId: string | null;
  turn: string;
  provider: string | null;
  model: string | null;
  request: any;
  response: any;
  error: string | null;
  ms: number;
}

export type LlmCallSink = (record: LlmCallRecord) => void;

/** An `LlmTelemetry` row: pure numeric and categorized telemetry (no prompt/response payload blobs). */
export interface LlmTelemetryRecord {
  createdAt: Date;
  projectId: string;
  userId?: string | null;
  conversationId: number;
  requestId: number;
  turn: number;
  provider: string;
  model: string;
  status: 'success' | 'error';
  finishReason?: string | null;
  requestChars: number;
  responseChars: number;
  estimatedTokens?: number | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  cachedTokens?: number | null;
  totalTokens?: number | null;
  latencyMs: number;
}

export type LlmTelemetrySink = (record: LlmTelemetryRecord) => void;

export function calculateRequestChars(req: LlmRequest): number {
  let chars = (req.systemPrompt?.length ?? 0);
  if (req.messages) {
    for (const m of req.messages) {
      chars += (m.content?.length ?? 0);
      if (m.toolCalls) {
        chars += JSON.stringify(m.toolCalls).length;
      }
    }
  }
  if (req.tools) {
    chars += JSON.stringify(req.tools).length;
  }
  return chars;
}

export function calculateResponseChars(res?: LlmResponse): number {
  if (!res) return 0;
  let chars = res.text?.length ?? 0;
  if (res.toolCalls && res.toolCalls.length > 0) {
    chars += JSON.stringify(res.toolCalls).length;
  }
  return chars;
}

export async function traceLlmCall(
  key: LlmTraceKey,
  llmReq: LlmRequest,
  call: () => Promise<LlmResponse>,
  sink?: LlmCallSink,
  telemetrySink?: LlmTelemetrySink,
): Promise<LlmResponse> {
  const dir = process.env.CURATOR_LLM_TRACE;
  if (!dir && !sink && !telemetrySink) return call();
  const createdAt = new Date();
  let response: LlmResponse | undefined;
  let error: string | undefined;
  try {
    response = await call();
    return response;
  } catch (err: any) {
    error = err?.message ?? String(err);
    throw err;
  } finally {
    const ms = Date.now() - createdAt.getTime();

    // 1. Lightweight numeric telemetry
    if (telemetrySink) {
      try {
        const reqChars = calculateRequestChars(llmReq);
        const resChars = calculateResponseChars(response);
        const turnNum = typeof key.turn === 'number' ? key.turn : parseInt(String(key.turn), 10) || 0;
        const promptTokens = response?.usage?.inputTokens ?? null;
        const completionTokens = response?.usage?.outputTokens ?? null;
        const cachedTokens = response?.usage?.cachedTokens ?? null;
        const totalTokens = response?.usage?.totalTokens ?? ((promptTokens != null || completionTokens != null) ? (promptTokens ?? 0) + (completionTokens ?? 0) : null);

        const telemetryRecord: LlmTelemetryRecord = {
          createdAt,
          projectId: key.projectId || 'system',
          userId: key.userId ?? null,
          conversationId: key.conversationId,
          requestId: key.requestId,
          turn: turnNum,
          provider: key.provider || 'unknown',
          model: llmReq.model || 'unknown',
          status: error ? 'error' : 'success',
          finishReason: response?.finishReason ?? (error ? 'error' : null),
          requestChars: reqChars,
          responseChars: resChars,
          estimatedTokens: Math.ceil(reqChars / 4),
          promptTokens,
          completionTokens,
          cachedTokens,
          totalTokens,
          latencyMs: ms,
        };
        telemetrySink(telemetryRecord);
      } catch (err: any) {
        logger.warn(`[LlmTrace] Telemetry sink failed: ${err.message}`);
      }
    }

    // 2. Full debug trace (LlmCall table & file dump)
    if (sink || dir) {
      // Copied now: the caller keeps appending to `llmReq.messages` after this call.
      const request = JSON.parse(JSON.stringify(llmReq));
      const record: LlmCallRecord = {
        createdAt,
        conversationId: key.conversationId,
        requestId: key.requestId,
        projectId: key.projectId ?? null,
        turn: String(key.turn),
        provider: key.provider ?? null,
        model: llmReq.model ?? null,
        request,
        response: response ? JSON.parse(JSON.stringify(response)) : null,
        error: error ?? null,
        ms,
      };
      if (sink) {
        try { sink(record); } catch (err: any) { logger.warn(`[LlmTrace] Sink failed: ${err.message}`); }
      }
      if (dir) {
        const file = path.join(path.resolve(dir), String(key.conversationId), `${key.requestId}-${key.turn}.json`);
        try {
          await mkdir(path.dirname(file), { recursive: true });
          await writeFile(file, JSON.stringify(record, null, 2));
        } catch (err: any) {
          logger.warn(`[LlmTrace] Could not write ${file}: ${err.message}`);
        }
      }
    }
  }
}
