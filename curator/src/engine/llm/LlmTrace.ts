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

export async function traceLlmCall(
  key: LlmTraceKey,
  llmReq: LlmRequest,
  call: () => Promise<LlmResponse>,
  sink?: LlmCallSink,
): Promise<LlmResponse> {
  const dir = process.env.CURATOR_LLM_TRACE;
  if (!dir && !sink) return call();
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
