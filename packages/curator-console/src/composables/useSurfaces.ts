import { computed, ref } from 'vue';
import { extractSurface } from '@curator/host/contracts';
import type { HarnessUiSurface } from '../types';

export interface SurfaceEntry {
  id: string;
  surface: HarnessUiSurface;
  /** The request whose result it came from (null for surfaces opened by the client, e.g. App Resources). */
  requestId: string | null;
  createdAt: number;
}

export interface ShowSurfaceOptions {
  requestId?: string | number | null;
  /** Make it the active surface (default true). */
  activate?: boolean;
}

/**
 * The surfaces of this session (newest first) and which one the panel shows. A surface from the same request, or
 * the same client-opened component and title, replaces its earlier entry instead of piling up.
 */
export function useSurfaces(options: { max?: number } = {}) {
  const max = options.max ?? 30;
  const entries = ref<SurfaceEntry[]>([]);
  const activeId = ref<string | null>(null);
  let seq = 0;

  function show(surface: HarnessUiSurface, opts: ShowSurfaceOptions = {}): string {
    const requestId = opts.requestId != null && opts.requestId !== '' ? String(opts.requestId) : null;
    const same = entries.value.find((e) =>
      requestId ? e.requestId === requestId : !e.requestId && e.surface.component === surface.component && e.surface.title === surface.title
    );
    const id = same?.id ?? `surface_${++seq}`;
    const entry: SurfaceEntry = { id, surface, requestId, createdAt: Date.now() };
    entries.value = [entry, ...entries.value.filter((e) => e.id !== id)].slice(0, max);
    if (opts.activate !== false) activeId.value = id;
    return id;
  }

  const active = computed<HarnessUiSurface | null>({
    get: () => entries.value.find((e) => e.id === activeId.value)?.surface ?? null,
    set: (surface) => {
      if (surface) show(surface);
      else activeId.value = null;
    },
  });

  function open(id: string): void {
    if (entries.value.some((e) => e.id === id)) activeId.value = id;
  }

  function close(): void {
    activeId.value = null;
  }

  function entryFor(requestId: string | number | null | undefined): SurfaceEntry | null {
    if (requestId == null || requestId === '') return null;
    return entries.value.find((e) => e.requestId === String(requestId)) ?? null;
  }

  /**
   * Restores surfaces after a reload from stored requests (`{ id, responses: [{ content }] }`, newest first): every
   * response whose JSON content declares a surface. Keeps the active surface (if none, the newest becomes active).
   */
  function rebuildFrom(requests: Array<{ id: string | number; responses?: Array<{ content?: string | null }> }>): number {
    let added = 0;
    for (const req of [...requests].reverse()) {
      for (const res of req.responses ?? []) {
        if (typeof res.content !== 'string' || !res.content.trim().startsWith('{')) continue;
        try {
          const surface = extractSurface(JSON.parse(res.content));
          if (surface && !entryFor(req.id)) {
            show(surface as HarnessUiSurface, { requestId: req.id, activate: false });
            added++;
          }
        } catch {
          // not JSON
        }
      }
    }
    // Nothing open yet: show the newest restored surface
    if (added && !activeId.value) activeId.value = entries.value[0]?.id ?? null;
    return added;
  }

  return { entries, activeId, active, show, open, close, entryFor, rebuildFrom };
}

export type SurfacesHandle = ReturnType<typeof useSurfaces>;
