/**
 * wasm/wasm-curator-engine.ts
 * WASM-local Curator Engine for the browser Web Worker.
 *
 * Mirrors the server-side plugin/agent/tool architecture:
 *  - Plugins register tools and agent definitions
 *  - Agents have an AST (Sequence of ToolTask steps)
 *  - The AST executor resolves tools from the registry and runs them
 *  - Progress is emitted via self.postMessage({ type: 'AGENT_PROGRESS', ... })
 */

import { scrapeProgram } from './err-scraper';
import type {
  AstNode,
  SequenceNode,
  ToolTaskNode,
  ExecutionContext,
  WasmToolHandler,
  ProgramManifest,
  ProgramManifestEntry,
  OpfsDatabase,
  ProgressCallback,
} from './types';

// ─── Program manifest (mirrors keeris-domain.js agents) ─────────────────────
export const PROGRAM_MANIFEST: ProgramManifest = {
  vikerraadio_kauamangiv_scrape: { seriesContentId: '1037846', programTitle: 'Kauamängiv' },
  vikerraadio_originaal_ja_koopia_scrape: { seriesContentId: '1037950', programTitle: 'Originaal ja koopia' },
  vikerraadio_kantri_alati_jaab_scrape: { seriesContentId: '1037843', programTitle: 'Kantri alati jääb' },
  vikerraadio_kuldrandevuu_scrape: { seriesContentId: '1037864', programTitle: 'Kuldrandevüü' },
  klassikaraadio_fantaasia_scrape: { seriesContentId: '1038126', programTitle: 'Fantaasia' },
  klassikaraadio_kella_6_dzass_scrape: { seriesContentId: '1038156', programTitle: 'Kella-6-džäss' },
  klassikaraadio_lihtsalt_nostalgia_scrape: {
    seriesContentId: 'https://klassikaraadio.err.ee/1610109911/lihtsalt-nostalgia-kaisa-johvik',
    programTitle: 'Lihtsalt nostalgia',
  },
  vikerraadio_oomuusika_scrape: {
    seriesContentId: 'https://vikerraadio.err.ee/1610113264/oomuusika',
    programTitle: 'Öömuusika',
  },
  klassikaraadio_helitrakk_scrape: {
    seriesContentId: 'https://klassikaraadio.err.ee/1610105843/helitrakk',
    programTitle: 'Heliträkk',
  },
  klassikaraadio_folgialbum_scrape: { seriesContentId: '1038132', programTitle: 'Folgialbum' },
  klassikaraadio_vanamuusikatund_scrape: { seriesContentId: '1038247', programTitle: 'Vanamuusikatund' },
  klassikaraadio_tantsutund_scrape: { seriesContentId: '1038102', programTitle: 'Tantsutund' },
  vikerraadio_heldur_karmo_aeg_scrape: { seriesContentId: '1610049724', programTitle: 'Heldur Karmo aeg' },
  vikerraadio_muusika_noudlikule_maitsele_scrape: {
    seriesContentId: '1608635380',
    programTitle: 'Muusika nõudlikule maitsele',
  },
  vikerraadio_jaak_joala_parimad_laulud_scrape: {
    seriesContentId: 'https://vikerraadio.err.ee/1609719716/jaak-joala-parimad-laulud',
    programTitle: 'Jaak Joala parimad laulud',
  },
  vikerraadio_stuudios_on_jaan_elgula_scrape: {
    seriesContentId: 'https://vikerraadio.err.ee/817942/stuudios-on-jaan-elgula-2-tund/818433',
    programTitle: 'Stuudios on Jaan Elgula',
  },
  vikerraadio_soovide_aeg_scrape: { seriesContentId: '1038019', programTitle: 'Soovide aeg' },
};

/**
 * Resolve agent name from a human-readable programTitle.
 * Used by triggerCuratorAgent when called with a display name.
 */
export function resolveAgentByTitle(
  programTitle: string
): ({ agentName: string } & ProgramManifestEntry) | null {
  for (const [agentName, def] of Object.entries(PROGRAM_MANIFEST)) {
    if (def.programTitle.toLowerCase() === programTitle.toLowerCase()) {
      return { agentName, ...def };
    }
  }
  // Fuzzy: match by normalized slug
  const slug = programTitle.toLowerCase().replace(/[^a-z0-9]/g, '_');
  for (const [agentName, def] of Object.entries(PROGRAM_MANIFEST)) {
    if (agentName.includes(slug) || def.programTitle.toLowerCase().replace(/[^a-z0-9]/g, '_') === slug) {
      return { agentName, ...def };
    }
  }
  return null;
}

/**
 * Build the canonical agent AST for a program (mirrors createProgramScrapeAST).
 * Uses a single ToolTask for simplicity in WASM context.
 */
export function buildAgentAst({ seriesContentId, programTitle }: ProgramManifestEntry): SequenceNode {
  return {
    id: `seq_scrape_${seriesContentId}`,
    type: 'Sequence',
    steps: [
      {
        id: `tool_scrape_${seriesContentId}`,
        type: 'ToolTask',
        tool: 'vikerraadio_scrape',
        args: { seriesContentId: String(seriesContentId), programTitle },
      },
    ],
  };
}

// ─── WASM Tool Registry ──────────────────────────────────────────────────────

let _db: OpfsDatabase | null = null;
let _onProgress: ProgressCallback | null = null;
let _isPaused = false;
let _activeRequestsCount = 0;

/** Initialize the engine with a db handle and progress emitter. */
export function initWasmCuratorEngine(db: OpfsDatabase | null, onProgress?: ProgressCallback | null): void {
  _db = db;
  if (onProgress) _onProgress = onProgress;
}

/** Update the active database reference */
export function updateEngineDb(db: OpfsDatabase | null): void {
  _db = db;
}

/** Check if engine is actively executing an AST request */
export function isEngineBusy(): boolean {
  return _activeRequestsCount > 0;
}

export const WASM_TOOLS: Record<string, WasmToolHandler> = {
  /**
   * vikerraadio_scrape: Full scrape pipeline for any ERR series.
   */
  async vikerraadio_scrape({ args, isPaused, checkPause }) {
    if (!_db) throw new Error('Database not initialized in WASM Curator Engine');
    const seriesContentId = args?.seriesContentId ?? '1037846';
    const programTitle = args?.programTitle ?? 'Unknown Program';
    const refresh = args?.refresh === true;
    return await scrapeProgram(_db, {
      seriesContentId,
      programTitle,
      refresh,
      onProgress: _onProgress,
      isPaused: isPaused || (() => _isPaused),
      checkPause,
    });
  },

  /**
   * keeris_scrape: Convenience wrapper for Kauamängiv.
   */
  async keeris_scrape({ args, isPaused, checkPause }) {
    if (!_db) throw new Error('Database not initialized in WASM Curator Engine');
    return await scrapeProgram(_db, {
      seriesContentId: '1037846',
      programTitle: 'Kauamängiv',
      refresh: args?.refresh === true,
      onProgress: _onProgress,
      isPaused: isPaused || (() => _isPaused),
      checkPause,
    });
  },
};

// ─── AST Executor ────────────────────────────────────────────────────────────

const _pausedRequestIds = new Set<string>();

/** Set whether the entire WASM Curator Engine / Scraper is paused */
export function setWasmEnginePaused(paused: boolean): void {
  _isPaused = Boolean(paused);
}

/** Check if the engine is paused */
export function isWasmEnginePaused(): boolean {
  return _isPaused;
}

/** Check if an individual request or the entire engine is paused */
export function isRequestPaused(requestId?: string | null): boolean {
  return _isPaused || Boolean(requestId && _pausedRequestIds.has(requestId));
}

/** Pause an individual request */
export function pauseRequest(requestId: string): void {
  if (!requestId) return;
  _pausedRequestIds.add(requestId);
  if (_db) {
    try {
      executeSql(_db, "UPDATE requests SET status = 'paused' WHERE id = ?", [requestId]);
    } catch (_) {}
  }
  _onProgress && _onProgress('log', `[CuratorEngine] Request ${requestId} paused.`);
}

/** Resume a paused request */
export function resumeRequest(requestId: string): void {
  if (!requestId) return;
  _pausedRequestIds.delete(requestId);
  if (_db) {
    try {
      executeSql(_db, "UPDATE requests SET status = 'pending' WHERE id = ?", [requestId]);
    } catch (_) {}
  }
  _onProgress && _onProgress('log', `[CuratorEngine] Request ${requestId} resumed.`);
}

/**
 * Execute a Curator AST node.
 * Supports: Sequence, ToolTask, ForEach with step and iteration pause checkpoints.
 */
async function executeAstNode(
  node: AstNode,
  env: ExecutionContext = {},
  requestId: string | null = null
): Promise<any> {
  if (!node || !node.type) throw new Error('Invalid AST node: ' + JSON.stringify(node));

  switch (node.type) {
    case 'Sequence': {
      let result: any = null;
      const startIndex = env.__pausedStepIndex__ ?? 0;
      delete env.__pausedStepIndex__;

      for (let i = startIndex; i < (node.steps ?? []).length; i++) {
        if (isRequestPaused(requestId)) {
          env.__pausedStepIndex__ = i;
          env.__paused__ = true;
          _onProgress && _onProgress('log', `[CuratorEngine] Request ${requestId} paused at step ${i}`);
          if (_db && requestId) {
            executeSql(_db, "UPDATE requests SET status = 'paused', context = ? WHERE id = ?", [
              JSON.stringify(env),
              requestId,
            ]);
          }
          return null;
        }

        const step = node.steps[i];
        result = await executeAstNode(step, env, requestId);
        if ((step as any).as) env[(step as any).as] = result;
        if (env.__paused__) return null;
      }
      return result;
    }

    case 'ToolTask': {
      const toolName = node.tool;
      const tool = WASM_TOOLS[toolName];
      if (!tool) {
        _onProgress && _onProgress('log', '[CuratorEngine] Unknown tool: ' + toolName);
        return null;
      }

      const checkPause = async () => {
        if (isRequestPaused(requestId)) {
          _onProgress && _onProgress('log', `[CuratorEngine] ⏸ Tool '${toolName}' paused. Waiting to resume...`);
          while (isRequestPaused(requestId)) {
            await new Promise((r) => setTimeout(r, 400));
          }
          _onProgress && _onProgress('log', `[CuratorEngine] ▶ Tool '${toolName}' resumed.`);
        }
      };

      await checkPause();

      // Resolve template args (basic {{varName.field}} interpolation)
      const resolvedArgs = resolveTemplateArgs(node.args ?? {}, env);
      _onProgress && _onProgress('log', '[CuratorEngine] Executing tool: ' + toolName);
      const result = await tool({
        args: resolvedArgs,
        env,
        onProgress: _onProgress,
        isPaused: () => isRequestPaused(requestId),
        checkPause,
      });

      await checkPause();
      return result;
    }

    case 'ForEach': {
      const collection = resolveValue(node.collection, env);
      if (!Array.isArray(collection)) return null;
      const results: any[] = [];
      const startIndex = env.__pausedIterIndex__ ?? 0;
      delete env.__pausedIterIndex__;

      for (let i = startIndex; i < collection.length; i++) {
        if (isRequestPaused(requestId)) {
          env.__pausedIterIndex__ = i;
          env.__paused__ = true;
          _onProgress &&
            _onProgress('log', `[CuratorEngine] Request ${requestId} paused at iteration ${i}/${collection.length}`);
          if (_db && requestId) {
            executeSql(_db, "UPDATE requests SET status = 'paused', context = ? WHERE id = ?", [
              JSON.stringify(env),
              requestId,
            ]);
          }
          return null;
        }

        const item = collection[i];
        const iterVar = node.iterator || (node as any).itemVar || 'item';
        const iterEnv = { ...env, [iterVar]: item };
        const res = await executeAstNode(node.body, iterEnv, requestId);
        results.push(res);
        if (iterEnv.__paused__) {
          env.__paused__ = true;
          return null;
        }
      }
      return results;
    }

    case 'IfElse': {
      const cond = Boolean(resolveValue(node.condition, env));
      const trueBranch = node.trueBranch || (node as any).then;
      const falseBranch = node.falseBranch || (node as any).else;
      if (cond && trueBranch) {
        return await executeAstNode(trueBranch, env, requestId);
      } else if (falseBranch) {
        return await executeAstNode(falseBranch, env, requestId);
      }
      return null;
    }

    default:
      _onProgress && _onProgress('log', '[CuratorEngine] Unsupported AST node type: ' + (node as any)?.type);
      return null;
  }
}

function resolveValue(template: any, env: ExecutionContext): any {
  if (typeof template !== 'string') return template;
  const match = template.match(/^\{\{(.+?)\}\}$/);
  if (!match) return template;
  return match[1].split('.').reduce((obj: any, key: string) => obj?.[key], env) ?? null;
}

function resolveTemplateArgs(args: Record<string, any>, env: ExecutionContext): Record<string, any> {
  if (typeof args !== 'object' || args === null) return args;
  return Object.fromEntries(
    Object.entries(args).map(([k, v]) => [k, typeof v === 'string' ? resolveValue(v, env) ?? v : v])
  );
}

// ─── Request Processor ───────────────────────────────────────────────────────

function queryAll(db: OpfsDatabase, sql: string, params: any[] = []): any[] {
  const rows: any[] = [];
  db.exec({ sql, bind: params, rowMode: 'object', resultRows: rows } as any);
  return rows;
}

function executeSql(db: OpfsDatabase, sql: string, params: any[] = []): void {
  db.exec({ sql, bind: params });
}

let isRunning = false;
let timerId: any = null;

export interface RequestProcessorHandle {
  pause: () => void;
  resume: () => void;
  isPaused: () => boolean;
  isBusy: () => boolean;
  pauseRequest: (id: string) => void;
  resumeRequest: (id: string) => void;
  updateDb: (newDb: OpfsDatabase | null) => void;
  stop: () => void;
}

/**
 * Start the Curator Engine request processor loop.
 * This mirrors server/src/services/RequestProcessor.ts in WASM.
 */
export function startWasmRequestProcessor(
  db: OpfsDatabase,
  { intervalMs = 2000, onProgress }: { intervalMs?: number; onProgress?: ProgressCallback | null } = {}
): RequestProcessorHandle {
  if (isRunning) {
    return {
      pause() { _isPaused = true; },
      resume() { _isPaused = false; },
      isPaused() { return _isPaused; },
      isBusy() { return _activeRequestsCount > 0; },
      pauseRequest(id) { pauseRequest(id); },
      resumeRequest(id) { resumeRequest(id); },
      updateDb(newDb) { _db = newDb; },
      stop() { isRunning = false; },
    };
  }

  isRunning = true;
  initWasmCuratorEngine(db, onProgress);

  // Ensure bootstrap rows exist for requests FK constraints (Curator canonical schema)
  try {
    executeSql(db, "INSERT OR IGNORE INTO \"User\" (id, email, name, createdAt, updatedAt) VALUES ('curator-user', 'curator@arula.dev', 'curator', strftime('%Y-%m-%d %H:%M:%f', 'now'), strftime('%Y-%m-%d %H:%M:%f', 'now'))");
    executeSql(db, "INSERT OR IGNORE INTO \"Project\" (id, name, userId, existent, createdAt, updatedAt) VALUES ('system', 'System Project', 'curator-user', 1, strftime('%Y-%m-%d %H:%M:%f', 'now'), strftime('%Y-%m-%d %H:%M:%f', 'now'))");
    executeSql(db, "INSERT OR IGNORE INTO \"Conversation\" (id, externalId, userId, projectId, existent, createdAt, updatedAt) VALUES (1, 'conv-1', 'curator-user', 'system', 1, strftime('%Y-%m-%d %H:%M:%f', 'now'), strftime('%Y-%m-%d %H:%M:%f', 'now'))");
  } catch (_) {
    try {
      executeSql(db, "INSERT OR IGNORE INTO users (id, name, email) VALUES ('1', 'wasm-user', 'wasm@local')");
      executeSql(db, "INSERT OR IGNORE INTO projects (id, name, user_id) VALUES ('1', 'keeris', '1')");
      executeSql(db, "INSERT OR IGNORE INTO conversations (id, user_id, project_id) VALUES ('1', '1', '1')");
    } catch (_) {}
  }

  // Seed agent records from manifest, inactive by default until manually enabled
  for (const [agentName, def] of Object.entries(PROGRAM_MANIFEST)) {
    try {
      executeSql(db, 'INSERT OR IGNORE INTO "Agent" (id, name, scriptId, schedule, userId, projectId, enabled, createdAt, updatedAt) VALUES (?, ?, 1, ?, \'curator-user\', \'system\', 0, strftime(\'%Y-%m-%d %H:%M:%f\', \'now\'), strftime(\'%Y-%m-%d %H:%M:%f\', \'now\'))', [
        agentName,
        def.programTitle,
        '0 0 * * *',
      ]);
    } catch (_) {
      try {
        executeSql(db, 'INSERT OR IGNORE INTO agents (id, name, schedule, is_active) VALUES (?, ?, ?, 0)', [
          agentName,
          def.programTitle,
          '0 0 * * *',
        ]);
      } catch (_) {}
    }
  }

  console.log('[Curator WASM Engine] RequestProcessor started.');
  onProgress?.('log', '[Curator WASM Engine] RequestProcessor started. Polling for pending requests...');

  async function tick() {
    if (!isRunning) return;
    if (_isPaused || !_db) {
      timerId = setTimeout(tick, intervalMs);
      return;
    }
    try {
      let pending: any[] = [];
      let isCanonicalTable = false;
      try {
        pending = queryAll(
          _db,
          "SELECT id, ast, context FROM \"Request\" WHERE status = 'pending' ORDER BY createdAt ASC LIMIT 3"
        );
        isCanonicalTable = true;
      } catch (_) {
        try {
          pending = queryAll(
            _db,
            "SELECT id, ast, context FROM requests WHERE status = 'pending' ORDER BY created_at ASC LIMIT 3"
          );
        } catch (_) {}
      }

      for (const req of pending) {
        _activeRequestsCount++;
        try {
          // Mark as running
          if (isCanonicalTable) {
            executeSql(_db, 'UPDATE "Request" SET status = \'running\', updatedAt = strftime(\'%Y-%m-%d %H:%M:%f\', \'now\') WHERE id = ?', [req.id]);
          } else {
            executeSql(_db, "UPDATE requests SET status = 'running' WHERE id = ?", [req.id]);
          }
          onProgress && onProgress('request_start', { requestId: req.id });
          onProgress && onProgress('log', '[CuratorEngine] Processing request ' + req.id);

          let ast: AstNode = { id: req.id, type: 'Sequence', steps: [] };
          try {
            ast = JSON.parse(req.ast);
          } catch (_) {}
          let env: ExecutionContext = {};
          try {
            env = req.context ? JSON.parse(req.context) : {};
          } catch (_) {}

          const logLines = ['[CuratorEngine] Request ' + req.id + ' started'];
          let success = true;

          try {
            const result = await executeAstNode(ast, env, req.id);
            if (env.__paused__) {
              onProgress && onProgress('log', '[CuratorEngine] Request ' + req.id + ' halted in paused state.');
              continue;
            }
            logLines.push('[CuratorEngine] Request ' + req.id + ' completed');
            if (result) logLines.push(JSON.stringify(result, null, 2));
          } catch (err: any) {
            success = false;
            logLines.push('[CuratorEngine] Request ' + req.id + ' failed: ' + err?.message);
            onProgress && onProgress('log', '[CuratorEngine] Error: ' + err?.message);
          }

          const respId = 'resp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
          if (isCanonicalTable) {
            executeSql(_db, 'INSERT INTO "Response" (id, requestId, conversationId, content, createdAt) VALUES (?, ?, 1, ?, strftime(\'%Y-%m-%d %H:%M:%f\', \'now\'))', [
              respId,
              req.id,
              logLines.join('\n'),
            ]);
            executeSql(_db, 'UPDATE "Request" SET status = ?, updatedAt = strftime(\'%Y-%m-%d %H:%M:%f\', \'now\') WHERE id = ?', [success ? 'completed' : 'failed', req.id]);
          } else {
            executeSql(_db, 'INSERT INTO responses (id, request_id, content) VALUES (?, ?, ?)', [
              respId,
              req.id,
              logLines.join('\n'),
            ]);
            executeSql(_db, 'UPDATE requests SET status = ? WHERE id = ?', [success ? 'completed' : 'failed', req.id]);
          }

          onProgress && onProgress('request_done', { requestId: req.id, success });
        } finally {
          _activeRequestsCount = Math.max(0, _activeRequestsCount - 1);
        }
      }
    } catch (err) {
      console.error('[Curator WASM Engine] Tick error:', err);
    } finally {
      if (isRunning && !_isPaused) timerId = setTimeout(tick, intervalMs);
    }
  }

  tick();

  return {
    pause() {
      _isPaused = true;
      console.log('[Curator WASM Engine] RequestProcessor paused.');
    },
    resume() {
      if (_isPaused) {
        _isPaused = false;
        if (timerId) clearTimeout(timerId);
        timerId = setTimeout(tick, 50);
        console.log('[Curator WASM Engine] RequestProcessor resumed.');
      }
    },
    isPaused() {
      return _isPaused;
    },
    isBusy() {
      return _activeRequestsCount > 0;
    },
    pauseRequest(id: string) {
      pauseRequest(id);
    },
    resumeRequest(id: string) {
      resumeRequest(id);
    },
    updateDb(newDb: OpfsDatabase | null) {
      _db = newDb;
    },
    stop() {
      isRunning = false;
      if (timerId) clearTimeout(timerId);
      console.log('[Curator WASM Engine] RequestProcessor stopped.');
    },
  };
}

/**
 * Enqueue a scrape job for a given agentName or programTitle.
 * Creates a proper Request row with the agent's AST.
 */
export function enqueueScrapeRequest(
  db: OpfsDatabase,
  agentNameOrTitle: string,
  refresh = false
): { reqId: string; agentName: string; programTitle: string; ast: SequenceNode } {
  let def: ProgramManifestEntry | undefined = PROGRAM_MANIFEST[agentNameOrTitle];
  if (!def) {
    const resolved = resolveAgentByTitle(agentNameOrTitle);
    if (resolved) def = resolved;
  }
  if (!def) {
    throw new Error('No agent found for: ' + agentNameOrTitle);
  }

  const ast = buildAgentAst(def);
  const firstStep = ast.steps[0] as ToolTaskNode;
  if (refresh && firstStep?.args) {
    firstStep.args.refresh = true;
  }

  const reqId = 'req-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
  try {
    executeSql(
      db,
      'INSERT INTO "Request" (id, userId, projectId, conversationId, ast, status, createdAt, updatedAt) VALUES (?, \'curator-user\', \'system\', 1, ?, \'pending\', strftime(\'%Y-%m-%d %H:%M:%f\', \'now\'), strftime(\'%Y-%m-%d %H:%M:%f\', \'now\'))',
      [reqId, JSON.stringify(ast)]
    );
  } catch (_) {
    try {
      executeSql(
        db,
        "INSERT INTO requests (id, user_id, project_id, conversation_id, ast, status) VALUES (?, '1', '1', '1', ?, 'pending')",
        [reqId, JSON.stringify(ast)]
      );
    } catch (_) {}
  }

  console.log('[Curator WASM Engine] Enqueued request ' + reqId + ' for agent: ' + def.programTitle);
  return { reqId, agentName: agentNameOrTitle, programTitle: def.programTitle, ast };
}
