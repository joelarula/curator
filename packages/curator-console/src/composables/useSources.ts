import { computed, ref, type Ref } from 'vue';
import type { RunTimeline } from '@curator/host/contracts';
import type { HarnessToolRunner } from './useInterrupts';
import type { AttachedResource } from './useAttachments';
import type { HarnessUiSurface } from '../types';

/** What a turn used: a tool call of its run, or a resource attached with `#`. */
export interface HarnessSource {
  key: string;
  kind: 'tool' | 'resource';
  label: string;
  /** Tool calls: their outcome. */
  state?: 'running' | 'COMPLETED' | 'FAILED';
  /** Tool calls: the agent step's request and the call's position among that step's calls. */
  requestId?: number;
  callIndex?: number;
  toolName?: string;
  /** Resources: their URI. */
  uri?: string;
}

/** Prefix of a stored tool result Response (`[Tool Result: <name>]` then the result on the next lines). */
const TOOL_RESULT = /^\[Tool Result: [^\]]*\]\r?\n?/;

/** The tool calls of a run as sources, in call order. */
export function toolSourcesOfRun(run: RunTimeline | null | undefined): HarnessSource[] {
  if (!run) return [];
  const out: HarnessSource[] = [];
  for (const step of run.steps) {
    step.calls.forEach((call, callIndex) => {
      out.push({
        key: `tool:${step.requestId}:${call.callId}`,
        kind: 'tool',
        label: call.label || call.toolName,
        state: call.state,
        requestId: step.requestId,
        callIndex,
        toolName: call.toolName,
      });
    });
  }
  return out;
}

/** The `index`-th stored tool result among a request's responses (what the model read), or null. */
export function toolResultAt(responses: readonly string[], index: number): string | null {
  const results = responses.filter((r) => TOOL_RESULT.test(r));
  const hit = results[index];
  return hit === undefined ? null : hit.replace(TOOL_RESULT, '');
}

/** A surface for a stored tool result: JSON when it parses as an object or array, else Markdown text. */
export function surfaceForToolResult(label: string, text: string): HarnessUiSurface {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return { component: 'json', title: label, data: JSON.parse(trimmed) } as HarnessUiSurface;
    } catch {
      // not JSON: shown as text
    }
  }
  return { component: 'markdown', title: label, data: trimmed || '_(empty result)_' } as HarnessUiSurface;
}

export interface SourcesOptions {
  run: Ref<RunTimeline | null>;
  /** Resources attached to the latest turn. */
  attached: Ref<AttachedResource[]>;
  /** Response contents of a request, in order (e.g. GraphQL `curatorRequest(id) { responses { content } }`). */
  loadResponses: (requestId: number) => Promise<string[]>;
  runTool: HarnessToolRunner;
  /** Opens a surface in the output panel. */
  show: (surface: HarnessUiSurface) => void;
}

/**
 * Source chips under the latest answer: the run's tool calls and the attached resources. Opening one shows the
 * stored tool result (what the model read, masked) or the resource's text in the output panel.
 */
export function useSources(options: SourcesOptions) {
  const opening = ref<string | null>(null);
  const error = ref<string | null>(null);

  const sources = computed<HarnessSource[]>(() => [
    ...toolSourcesOfRun(options.run.value),
    ...options.attached.value.map((r) => ({ key: `resource:${r.uri}`, kind: 'resource' as const, label: r.title, uri: r.uri })),
  ]);

  async function open(source: HarnessSource): Promise<void> {
    opening.value = source.key;
    error.value = null;
    try {
      if (source.kind === 'tool' && source.requestId != null && source.callIndex != null) {
        const text = toolResultAt(await options.loadResponses(source.requestId), source.callIndex);
        if (text === null) throw new Error(`No stored result for ${source.label} yet`);
        options.show(surfaceForToolResult(source.label, text));
      } else if (source.kind === 'resource' && source.uri) {
        const res = await options.runTool('get_resource', { uri: source.uri });
        if (!res?.found) throw new Error(res?.message || `Resource ${source.uri} not found`);
        const texts: string[] = (res.resource?.texts ?? []).map((t: any) => String(t.content ?? '')).filter(Boolean);
        const body = texts.join('\n\n') || res.resource?.description || '';
        options.show({ component: 'markdown', title: res.resource?.title || source.label, data: body || '_(no text)_' } as HarnessUiSurface);
      }
    } catch (err: any) {
      error.value = err?.message ?? String(err);
    } finally {
      opening.value = null;
    }
  }

  return { sources, opening, error, open };
}

export type SourcesHandle = ReturnType<typeof useSources>;
