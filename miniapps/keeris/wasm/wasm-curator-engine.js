/**
 * wasm/wasm-curator-engine.js
 * WASM-local Curator Engine for the browser Web Worker.
 * 
 * Mirrors the server-side plugin/agent/tool architecture:
 *  - Plugins register tools and agent definitions
 *  - Agents have an AST (Sequence of ToolTask steps)
 *  - The AST executor resolves tools from the registry and runs them
 *  - Progress is emitted via self.postMessage({ type: 'AGENT_PROGRESS', ... })
 *
 * The tool registry here contains browser-native implementations:
 *  - vikerraadio_discover_episodes  -> ERR API fetch (JSON)
 *  - vikerraadio_process_episode    -> fetch HTML + DOMParser + save to OPFS SQLite
 *  - keeris_scrape                  -> discover + process all episodes for a program
 */

import { scrapeProgram } from './err-scraper.js';

// ─── Program manifest (mirrors keeris-domain.js agents) ─────────────────────
// Maps agent name -> { seriesContentId, programTitle }
export const PROGRAM_MANIFEST = {
  vikerraadio_kauamangiv_scrape:                 { seriesContentId: '1037846',    programTitle: 'Kauamängiv' },
  vikerraadio_originaal_ja_koopia_scrape:        { seriesContentId: '1037950',    programTitle: 'Originaal ja koopia' },
  vikerraadio_kantri_alati_jaab_scrape:          { seriesContentId: '1037843',    programTitle: 'Kantri alati jääb' },
  vikerraadio_kuldrandevuu_scrape:               { seriesContentId: '1037864',    programTitle: 'Kuldrandevüü' },
  klassikaraadio_fantaasia_scrape:               { seriesContentId: '1038126',    programTitle: 'Fantaasia' },
  klassikaraadio_kella_6_dzass_scrape:           { seriesContentId: '1038156',    programTitle: 'Kella-6-džäss' },
  klassikaraadio_lihtsalt_nostalgia_scrape:      { seriesContentId: 'https://klassikaraadio.err.ee/1610109911/lihtsalt-nostalgia-kaisa-johvik', programTitle: 'Lihtsalt nostalgia' },
  vikerraadio_oomuusika_scrape:                  { seriesContentId: 'https://vikerraadio.err.ee/1610113264/oomuusika', programTitle: 'Öömuusika' },
  klassikaraadio_helitrakk_scrape:               { seriesContentId: 'https://klassikaraadio.err.ee/1610105843/helitrakk', programTitle: 'Heliträkk' },
  klassikaraadio_folgialbum_scrape:              { seriesContentId: '1038132',    programTitle: 'Folgialbum' },
  klassikaraadio_vanamuusikatund_scrape:         { seriesContentId: '1038247',    programTitle: 'Vanamuusikatund' },
  klassikaraadio_tantsutund_scrape:              { seriesContentId: '1038102',    programTitle: 'Tantsutund' },
  vikerraadio_heldur_karmo_aeg_scrape:           { seriesContentId: '1610049724', programTitle: 'Heldur Karmo aeg' },
  vikerraadio_muusika_noudlikule_maitsele_scrape:{ seriesContentId: '1608635380', programTitle: 'Muusika nõudlikule maitsele' },
  vikerraadio_jaak_joala_parimad_laulud_scrape:  { seriesContentId: 'https://vikerraadio.err.ee/1609719716/jaak-joala-parimad-laulud', programTitle: 'Jaak Joala parimad laulud' },
  vikerraadio_stuudios_on_jaan_elgula_scrape:    { seriesContentId: 'https://vikerraadio.err.ee/817942/stuudios-on-jaan-elgula-2-tund/818433', programTitle: 'Stuudios on Jaan Elgula' },
  vikerraadio_soovide_aeg_scrape:                { seriesContentId: '1038019',    programTitle: 'Soovide aeg' },
};

/**
 * Resolve agent name from a human-readable programTitle.
 * Used by triggerCuratorAgent when called with a display name.
 */
export function resolveAgentByTitle(programTitle) {
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
function buildAgentAst({ seriesContentId, programTitle }) {
  return {
    type: 'Sequence',
    name: 'scrape_' + programTitle,
    steps: [
      {
        type: 'ToolTask',
        tool: 'vikerraadio_scrape',
        args: { seriesContentId: String(seriesContentId), programTitle },
      },
    ],
  };
}

// ─── WASM Tool Registry ──────────────────────────────────────────────────────

let _db = null;
let _onProgress = null;

/** Initialize the engine with a db handle and progress emitter. */
export function initWasmCuratorEngine(db, onProgress) {
  _db = db;
  _onProgress = onProgress;
}

const WASM_TOOLS = {
  /**
   * vikerraadio_scrape: Full scrape pipeline for any ERR series.
   * Mirrors the server-side err-radio.js::vikerraadio_scrape tool.
   */
  async vikerraadio_scrape({ args }) {
    const seriesContentId = args?.seriesContentId ?? '1037846';
    const programTitle = args?.programTitle ?? 'Unknown Program';
    const refresh = args?.refresh === true;
    return await scrapeProgram(_db, {
      seriesContentId,
      programTitle,
      refresh,
      onProgress: _onProgress,
    });
  },

  /**
   * keeris_scrape: Convenience wrapper for Kauamängiv.
   */
  async keeris_scrape({ args }) {
    return await scrapeProgram(_db, {
      seriesContentId: '1037846',
      programTitle: 'Kauamängiv',
      refresh: args?.refresh === true,
      onProgress: _onProgress,
    });
  },
};

// ─── AST Executor ────────────────────────────────────────────────────────────

/**
 * Execute a Curator AST node.
 * Supports: Sequence, ToolTask (ForEach, IfElse are stubs for future).
 */
async function executeAstNode(node, env = {}) {
  if (!node || !node.type) throw new Error('Invalid AST node: ' + JSON.stringify(node));

  switch (node.type) {
    case 'Sequence': {
      let result = null;
      for (const step of node.steps ?? []) {
        result = await executeAstNode(step, env);
        if (step.as) env[step.as] = result;
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
      // Resolve template args (basic {{varName.field}} interpolation)
      const resolvedArgs = resolveTemplateArgs(node.args ?? {}, env);
      _onProgress && _onProgress('log', '[CuratorEngine] Executing tool: ' + toolName);
      return await tool({ args: resolvedArgs, env });
    }

    case 'ForEach': {
      const collection = resolveValue(node.collection, env);
      if (!Array.isArray(collection)) return null;
      const results = [];
      for (const item of collection) {
        const iterEnv = { ...env, [node.iterator ?? 'item']: item };
        results.push(await executeAstNode(node.body, iterEnv));
      }
      return results;
    }

    default:
      _onProgress && _onProgress('log', '[CuratorEngine] Unsupported AST node type: ' + node.type);
      return null;
  }
}

function resolveValue(template, env) {
  if (typeof template !== 'string') return template;
  const match = template.match(/^\{\{(.+?)\}\}$/);
  if (!match) return template;
  return match[1].split('.').reduce((obj, key) => obj?.[key], env) ?? null;
}

function resolveTemplateArgs(args, env) {
  if (typeof args !== 'object' || args === null) return args;
  return Object.fromEntries(
    Object.entries(args).map(([k, v]) => [k, typeof v === 'string' ? (resolveValue(v, env) ?? v) : v])
  );
}

// ─── Request Processor ───────────────────────────────────────────────────────

function queryAll(db, sql, params = []) {
  const rows = [];
  db.exec({ sql, bind: params, rowMode: 'object', resultRows: rows });
  return rows;
}

function executeSql(db, sql, params = []) {
  db.exec({ sql, bind: params });
}

let isRunning = false;
let timerId = null;

/**
 * Start the Curator Engine request processor loop.
 * This mirrors server/src/services/RequestProcessor.ts in WASM.
 *
 * Polls the requests table for pending AST requests,
 * executes them via the WASM tool registry, and writes responses.
 */
export function startWasmRequestProcessor(db, { intervalMs = 2000, onProgress } = {}) {
  if (isRunning) return;
  isRunning = true;
  initWasmCuratorEngine(db, onProgress);

  // Ensure bootstrap rows exist for requests FK constraints
  try {
    executeSql(db, "INSERT OR IGNORE INTO users (id, name, email) VALUES ('1', 'wasm-user', 'wasm@local')");
    executeSql(db, "INSERT OR IGNORE INTO projects (id, name, user_id) VALUES ('1', 'keeris', '1')");
    executeSql(db, "INSERT OR IGNORE INTO conversations (id, user_id, project_id) VALUES ('1', '1', '1')");
  } catch (_) {}

  // Seed agent records from manifest, inactive by default until manually enabled
  for (const [agentName, def] of Object.entries(PROGRAM_MANIFEST)) {
    try {
      executeSql(db, 'INSERT OR IGNORE INTO agents (id, name, schedule, is_active) VALUES (?, ?, ?, 0)',
        [agentName, def.programTitle, '0 0 * * *']);
    } catch (_) {}
  }

  // One-time migration for OPFS DBs seeded before the inactive-by-default change
  try {
    const versionRows = queryAll(db, 'PRAGMA user_version');
    const currentVersion = versionRows[0]?.user_version ?? 0;
    if (currentVersion < 1) {
      const manifestIds = Object.keys(PROGRAM_MANIFEST);
      const placeholders = manifestIds.map(() => '?').join(',');
      executeSql(db, `UPDATE agents SET is_active = 0 WHERE id IN (${placeholders})`, manifestIds);
      executeSql(db, 'PRAGMA user_version = 1');
    }
  } catch (_) {}

  console.log('[Curator WASM Engine] RequestProcessor started.');
  onProgress?.('log', '[Curator WASM Engine] RequestProcessor started. Polling for pending requests...');

  async function tick() {
    if (!isRunning) return;
    try {
      const pending = queryAll(db, "SELECT id, ast, context FROM requests WHERE status = 'pending' ORDER BY created_at ASC LIMIT 3");

      for (const req of pending) {
        // Mark as running
        executeSql(db, "UPDATE requests SET status = 'running' WHERE id = ?", [req.id]);
        onProgress && onProgress('request_start', { requestId: req.id });
        onProgress && onProgress('log', '[CuratorEngine] Processing request ' + req.id);

        let ast = {};
        try { ast = JSON.parse(req.ast); } catch (_) {}

        const logLines = ['[CuratorEngine] Request ' + req.id + ' started'];
        let success = true;

        try {
          const result = await executeAstNode(ast, {});
          logLines.push('[CuratorEngine] Request ' + req.id + ' completed');
          if (result) logLines.push(JSON.stringify(result, null, 2));
        } catch (err) {
          success = false;
          logLines.push('[CuratorEngine] Request ' + req.id + ' failed: ' + err.message);
          onProgress && onProgress('log', '[CuratorEngine] Error: ' + err.message);
        }

        const respId = 'resp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
        executeSql(db, 'INSERT INTO responses (id, request_id, content) VALUES (?, ?, ?)',
          [respId, req.id, logLines.join('\n')]);
        executeSql(db, 'UPDATE requests SET status = ? WHERE id = ?',
          [success ? 'completed' : 'failed', req.id]);

        onProgress && onProgress('request_done', { requestId: req.id, success });
      }
    } catch (err) {
      console.error('[Curator WASM Engine] Tick error:', err);
    } finally {
      if (isRunning) timerId = setTimeout(tick, intervalMs);
    }
  }

  tick();

  return {
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
export function enqueueScrapeRequest(db, agentNameOrTitle, refresh = false) {
  // Resolve by exact agent name first
  let def = PROGRAM_MANIFEST[agentNameOrTitle];
  if (!def) {
    const resolved = resolveAgentByTitle(agentNameOrTitle);
    if (resolved) def = resolved;
  }
  if (!def) {
    throw new Error('No agent found for: ' + agentNameOrTitle);
  }

  const ast = buildAgentAst(def);
  if (refresh) ast.steps[0].args.refresh = true;

  const reqId = 'req-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
  executeSql(db,
    "INSERT INTO requests (id, user_id, project_id, conversation_id, ast, status) VALUES (?, '1', '1', '1', ?, 'pending')",
    [reqId, JSON.stringify(ast)]);

  console.log('[Curator WASM Engine] Enqueued request ' + reqId + ' for agent: ' + def.programTitle);
  return { reqId, agentName: agentNameOrTitle, programTitle: def.programTitle, ast };
}
