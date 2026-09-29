<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="curator-console-overlay"
      @click.self="$emit('update:modelValue', false)"
    >
      <aside
        class="curator-console-drawer"
        :class="{ 'is-fullscreen': isExpanded }"
        :style="isExpanded ? { width: '100vw', maxWidth: '100vw' } : { width: drawerWidth + 'px' }"
        role="dialog"
        aria-label="Curator Dev Console"
      >
    <!-- Console Masthead -->
    <div class="console-header">
      <div class="console-title-group">
        <div class="d-flex align-center gap-2">
          <span class="engine-pulse-dot" :class="isPaused ? 'dot-paused' : 'dot-active'"></span>
          <h3 class="console-title">🤖 {{ title || 'Curator Dev Console' }}</h3>
          <span class="console-badge" :class="isPaused ? 'badge-paused' : 'badge-active'">
            {{ isPaused ? '⏸ PAUSED' : '⚡ ACTIVE' }}
          </span>
        </div>
        <div class="console-subtitle">Curator AST Engine &amp; SQLite Storage Debugger</div>
      </div>
      <div class="console-header-actions">
        <button 
          class="icon-action-btn" 
          :title="isExpanded ? 'Restore side drawer view' : 'Maximize to full page view'" 
          @click="toggleExpanded"
        >
          {{ isExpanded ? '🗗' : '⛶' }}
        </button>
        <button class="icon-action-btn" title="Close console (Esc or Ctrl+`)" @click="$emit('update:modelValue', false)">
          ✕
        </button>
      </div>
    </div>

    <!-- Quick Action Bar -->
    <div class="console-toolbar">
      <div class="toolbar-left">
        <button
          v-if="adapter?.togglePause"
          class="btn-ctl"
          :class="isPaused ? 'btn-resume' : 'btn-pause'"
          :disabled="togglingPause"
          type="button"
          @click="handleTogglePause"
        >
          {{ isPaused ? '▶ Resume' : '⏸ Pause' }}
        </button>

        <button
          v-if="adapter?.exportDatabase"
          class="btn-ctl btn-export"
          :disabled="exporting"
          type="button"
          title="Download current SQLite database file"
          @click="handleExportDatabase"
        >
          {{ exporting ? '⏳ Exporting...' : '⬇ Export DB' }}
        </button>

        <button
          v-if="adapter?.importDatabase"
          class="btn-ctl btn-import"
          :disabled="importing"
          type="button"
          title="Import any .sqlite/.sqlite3/.db file into storage"
          @click="triggerFileInput"
        >
          {{ importing ? '⏳ Importing...' : '⬆ Import DB' }}
        </button>
        <input
          v-if="adapter?.importDatabase"
          ref="fileInputRef"
          type="file"
          accept=".sqlite,.sqlite3,.db"
          style="display: none"
          @change="handleFileSelected"
        />

        <button
          v-if="adapter?.resetDatabase"
          class="btn-ctl btn-reset"
          :disabled="resetting"
          type="button"
          title="Wipe local storage and reload seed"
          @click="handleResetDatabase"
        >
          {{ resetting ? '⏳' : '🗑 Reset' }}
        </button>
      </div>

      <div class="toolbar-right">
        <span class="storage-pill" v-if="storageInfo.usage">
          💾 {{ formatMB(storageInfo.usage) }} / {{ formatMB(storageInfo.quota) }}
        </span>
      </div>
    </div>

    <!-- Active Step / Job Progress Banner -->
    <div v-if="currentJob" class="console-progress-banner">
      <div class="d-flex align-center justify-space-between text-caption mb-1">
        <span class="prog-label">
          ⚙ Processing: <strong>{{ currentJob.title || currentJob.episodeTitle || 'Workflow' }}</strong>
        </span>
        <span class="prog-counts" v-if="currentJob.total">
          Step {{ currentJob.index || 1 }} / {{ currentJob.total }}
        </span>
      </div>
      <div class="prog-bar-track" v-if="currentJob.total">
        <div
          class="prog-bar-fill"
          :style="{ width: Math.round(((currentJob.index || 1) / currentJob.total) * 100) + '%' }"
        ></div>
      </div>
    </div>

    <!-- Navigation Tabs -->
    <div class="console-tabs">
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'logs' }"
        @click="activeTab = 'logs'"
      >
        📟 Logs <span v-if="logEntries.length" class="tab-count">{{ logEntries.length }}</span>
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'agents' }"
        @click="activeTab = 'agents'"
      >
        🤖 Agents <span v-if="agents.length" class="tab-count">{{ agents.length }}</span>
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'requests' }"
        @click="activeTab = 'requests'"
      >
        📜 AST Tasks <span v-if="requests.length" class="tab-count">{{ requests.length }}</span>
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'storage' }"
        @click="activeTab = 'storage'"
      >
        💾 Database Health
      </button>
    </div>

    <!-- Tab Content Panels -->
    <div class="console-body">
      <!-- 1. LIVE LOGS TAB -->
      <div v-if="activeTab === 'logs'" class="tab-panel log-panel">
        <div class="log-controls-subbar">
          <div class="d-flex align-center gap-2">
            <input
              v-model="logFilter"
              type="text"
              class="filter-input"
              placeholder="Filter logs (e.g. error, IPC, TX)..."
            />
            <button
              class="sub-btn"
              :class="{ active: autoScroll }"
              @click="autoScroll = !autoScroll"
              title="Auto-scroll to bottom on new logs"
            >
              {{ autoScroll ? '↓ Scroll ON' : '↓ Scroll OFF' }}
            </button>
          </div>
          <button class="sub-btn text-danger" @click="logEntries = []">Clear</button>
        </div>

        <div class="log-terminal" ref="logContainerRef">
          <div v-if="filteredLogs.length === 0" class="log-empty">
            No log entries matching filter.
          </div>
          <div
            v-for="(item, idx) in filteredLogs"
            :key="idx"
            class="log-row"
            :class="'log-' + item.type"
          >
            <span class="log-time">{{ item.time }}</span>
            <span class="log-text">{{ item.text }}</span>
          </div>
        </div>
      </div>

      <!-- 2. AGENTS & WORKFLOWS TAB -->
      <div v-if="activeTab === 'agents'" class="tab-panel agents-panel">
        <div class="panel-desc">
          Manage and trigger Curator Agent workflows. Disabled agents will not run on schedule.
        </div>
        <div v-if="agents.length === 0" class="log-empty">
          No registered Curator agents found.
        </div>
        <div v-else class="agents-grid">
          <div
            v-for="ag in agents"
            :key="ag.id"
            class="agent-compact-card"
            :class="{ 'agent-disabled': !ag.isActive && !ag.enabled }"
          >
            <!-- Header row: name + enabled badge -->
            <div class="ag-header-row">
              <div class="ag-title">
                {{ ag.name }}
                <span class="ag-status-badge" :class="(ag.isActive || ag.enabled) ? 'badge-enabled' : 'badge-disabled'">
                  {{ (ag.isActive || ag.enabled) ? '● ON' : '○ OFF' }}
                </span>
              </div>
            </div>

            <!-- Cron schedule row (editable) -->
            <div class="ag-cron-row" v-if="ag.schedule !== undefined">
              <span class="ag-cron-label">Cron:</span>
              <input
                class="ag-cron-input"
                :value="editingSchedule[ag.id] ?? ag.schedule"
                :title="'Edit cron expression (5 fields). Press Enter to save.'"
                @input="editingSchedule[ag.id] = $event.target.value"
                @keydown.enter.prevent="saveSchedule(ag)"
                @blur="saveSchedule(ag)"
              />
              <span v-if="ag.lastRunAt" class="ag-last-run">Last: {{ formatRelativeTime(ag.lastRunAt) }}</span>
            </div>

            <!-- Action buttons row -->
            <div class="ag-actions-row">
              <!-- Enable / Disable toggle -->
              <button
                class="ag-toggle-btn"
                :class="(ag.isActive || ag.enabled) ? 'ag-btn-disable' : 'ag-btn-enable'"
                :disabled="togglingAgents.has(ag.id)"
                @click="toggleAgent(ag)"
              >
                {{ togglingAgents.has(ag.id) ? '...' : (ag.isActive || ag.enabled) ? '⏸ Disable' : '▶ Enable' }}
              </button>

              <!-- Run Now -->
              <button
                v-if="adapter?.triggerAgent"
                class="ag-run-btn"
                :disabled="runningAgents.has(ag.id) || (!ag.isActive && !ag.enabled)"
                :title="(!ag.isActive && !ag.enabled) ? 'Agent is disabled. Enable agent first to run.' : 'Run now'"
                @click="triggerAgent(ag)"
              >
                {{ runningAgents.has(ag.id) ? '⚙ Running...' : '⚡ Run Now' }}
              </button>

              <!-- Soft Delete -->
              <button
                class="ag-delete-btn"
                :disabled="deletingAgents.has(ag.id)"
                title="Soft delete agent along with its script"
                @click="deleteAgent(ag)"
              >
                {{ deletingAgents.has(ag.id) ? '...' : '🗑 Delete' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 3. AST REQUESTS TAB (Hierarchical Tree View) -->
      <div v-if="activeTab === 'requests'" class="tab-panel requests-panel">
        <!-- Toolbar / Search / Filters -->
        <div class="requests-toolbar">
          <div class="req-search-group">
            <input
              v-model="requestSearchQuery"
              type="text"
              class="req-search-input"
              placeholder="Search tasks, agents, tools, IDs..."
            />
            <button
              v-if="requestSearchQuery"
              class="clear-search-btn"
              title="Clear search"
              @click="requestSearchQuery = ''"
            >✕</button>
          </div>

          <div class="req-status-filters">
            <button
              class="filter-pill"
              :class="{ active: requestStatusFilter === 'all' }"
              @click="requestStatusFilter = 'all'"
            >
              All ({{ requests.length }})
            </button>
            <button
              class="filter-pill status-pill-active"
              :class="{ active: requestStatusFilter === 'active' }"
              @click="requestStatusFilter = 'active'"
            >
              Active / Pending
            </button>
            <button
              class="filter-pill status-pill-completed"
              :class="{ active: requestStatusFilter === 'completed' }"
              @click="requestStatusFilter = 'completed'"
            >
              Completed
            </button>
            <button
              class="filter-pill status-pill-failed"
              :class="{ active: requestStatusFilter === 'failed' }"
              @click="requestStatusFilter = 'failed'"
            >
              Failed
            </button>
          </div>

          <div class="req-actions-group">
            <button
              class="sub-btn"
              title="Expand all tree nodes"
              @click="expandAllRequestNodes"
            >
              ⊞ Expand
            </button>
            <button
              class="sub-btn"
              title="Collapse all tree nodes"
              @click="collapseAllRequestNodes"
            >
              ⊟ Collapse
            </button>
            <button
              class="sub-btn primary-sub-btn"
              :disabled="loadingRequests"
              @click="fetchRequests"
            >
              {{ loadingRequests ? '...' : '↻ Refresh' }}
            </button>
          </div>
        </div>

        <div v-if="requests.length === 0" class="log-empty">
          No AST workflow execution requests logged yet.
        </div>
        <div v-else-if="requestTree.length === 0" class="log-empty">
          No tasks match the active search or filter criteria.
        </div>
        <div v-else class="requests-tree-view">
          <RequestTreeNode
            v-for="node in requestTree"
            :key="node.id"
            :node="node"
            :depth="0"
            :collapsed-nodes="collapsedRequestNodes"
            :selected-node-id="selectedRequestNodeId"
            @toggle-collapse="toggleRequestNodeCollapse"
            @select-node="selectedRequestNodeId = $event.id"
          />
        </div>
      </div>

      <!-- 4. STORAGE & HEALTH TAB -->
      <div v-if="activeTab === 'storage'" class="tab-panel storage-panel">
        <div class="health-card">
          <h4>Curator Storage Environment</h4>
          <div class="health-row">
            <span>Storage Engine:</span>
            <strong>{{ curatorHealth.storageEngine || 'SQLite3 WASM (OPFS)' }}</strong>
          </div>
          <div class="health-row" v-if="storageInfo.usage">
            <span>Disk Usage:</span>
            <strong>{{ formatMB(storageInfo.usage) }}</strong>
          </div>
          <div class="health-row" v-if="storageInfo.quota">
            <span>Disk Quota:</span>
            <strong>{{ formatMB(storageInfo.quota) }}</strong>
          </div>
          <div class="health-row">
            <span>Engine Status:</span>
            <strong :class="isPaused ? 'text-warning' : 'text-success'">{{ isPaused ? 'Paused' : 'Active & Synced' }}</strong>
          </div>
        </div>

        <div class="health-card mt-3">
          <h4>Curator Engine Health</h4>
          <div class="health-grid">
            <div class="h-metric">
              <span class="h-val">{{ curatorHealth.requestsTotal ?? requests.length }}</span>
              <span class="h-lbl">Total AST Tasks</span>
            </div>
            <div class="h-metric">
              <span class="h-val" style="color: #34d399;">{{ curatorHealth.requestsCompleted ?? 0 }}</span>
              <span class="h-lbl">Completed Tasks</span>
            </div>
            <div class="h-metric">
              <span class="h-val" style="color: #fbbf24;">{{ curatorHealth.requestsPending ?? 0 }}</span>
              <span class="h-lbl">Pending / Running</span>
            </div>
            <div class="h-metric">
              <span class="h-val" style="color: #a78bfa;">{{ curatorHealth.agentsTotal ?? agents.length }}</span>
              <span class="h-lbl">Registered Agents</span>
            </div>
          </div>
        </div>

        <div class="health-card mt-3" v-if="curatorHealth.tables && curatorHealth.tables.length">
          <h4>Database Tables ({{ curatorHealth.tables.length }})</h4>
          <table class="health-table">
            <thead>
              <tr>
                <th>Table Name</th>
                <th style="text-align: right;">Rows</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="tbl in curatorHealth.tables" :key="tbl.name">
                <td><code>{{ tbl.name }}</code></td>
                <td style="text-align: right;"><span class="table-count-badge">{{ tbl.rowCount.toLocaleString() }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="health-card mt-3" v-if="domainMetrics && Object.keys(domainMetrics).length">
          <h4>Application Domain Metrics</h4>
          <div class="health-grid">
            <div v-for="(val, key) in domainMetrics" :key="key" class="h-metric">
              <span class="h-val">{{ typeof val === 'number' ? val.toLocaleString() : val }}</span>
              <span class="h-lbl">{{ key }}</span>
            </div>
          </div>
        </div>

        <div class="health-card mt-3">
          <h4>Database Operations</h4>
          <div class="d-flex flex-column gap-2 mt-2">
            <button v-if="adapter?.exportDatabase" class="btn-ctl btn-export w-100" @click="handleExportDatabase">
              ⬇ Export SQLite Database (.sqlite3)
            </button>
            <button v-if="adapter?.importDatabase" class="btn-ctl btn-import w-100" @click="triggerFileInput">
              ⬆ Import Custom SQLite Database
            </button>
            <button v-if="adapter?.resetDatabase" class="btn-ctl btn-reset w-100" @click="handleResetDatabase">
              🗑 Wipe &amp; Re-initialize Clean Database
            </button>
          </div>
        </div>
      </div>
    </div>
  </aside>
</div>
</Teleport>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import RequestTreeNode from './RequestTreeNode.vue';

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  adapter: {
    type: Object,
    required: true,
  },
  title: {
    type: String,
    default: 'Curator Dev Console',
  },
  domainMetrics: {
    type: Object,
    default: () => ({}),
  },
});

const emit = defineEmits(['update:modelValue']);

const activeTab = ref('logs');
const isExpanded = ref(false);
const isPaused = ref(false);
const togglingPause = ref(false);
const exporting = ref(false);
const importing = ref(false);
const resetting = ref(false);

const logEntries = ref([]);
const logFilter = ref('');
const autoScroll = ref(true);
const currentJob = ref(null);
const logContainerRef = ref(null);
const fileInputRef = ref(null);

const agents = ref([]);
const requests = ref([]);
const runningAgents = ref(new Set());
const togglingAgents = ref(new Set());
const deletingAgents = ref(new Set());
const editingSchedule = ref({});
const storageInfo = ref({ usage: 0, quota: 0 });
const curatorHealth = ref({
  storageEngine: 'SQLite3 WASM (OPFS)',
  isOpfs: true,
  tables: [],
  requestsTotal: 0,
  requestsCompleted: 0,
  requestsFailed: 0,
  requestsPending: 0,
  agentsTotal: 0,
  agentsActive: 0,
});

// AST Task Tree View State
const requestSearchQuery = ref('');
const requestStatusFilter = ref('all');
const requestLimit = ref(60);
const loadingRequests = ref(false);
const collapsedRequestNodes = ref(new Set());
const selectedRequestNodeId = ref(null);

let unsubProgress = null;
let unsubDbChange = null;

const drawerWidth = computed(() => {
  if (typeof window === 'undefined') return 560;
  if (isExpanded.value) return window.innerWidth;
  return Math.min(window.innerWidth, 560);
});

const filteredLogs = computed(() => {
  if (!logFilter.value.trim()) return logEntries.value;
  const q = logFilter.value.toLowerCase();
  return logEntries.value.filter((entry) => entry.text.toLowerCase().includes(q));
});

function toggleExpanded() {
  isExpanded.value = !isExpanded.value;
}

function addLog(type, text) {
  const time = new Date().toLocaleTimeString();
  logEntries.value.push({ type, text, time });
  if (logEntries.value.length > 500) {
    logEntries.value.splice(0, logEntries.value.length - 500);
  }
  if (autoScroll.value) {
    nextTick(() => {
      if (logContainerRef.value) {
        logContainerRef.value.scrollTop = logContainerRef.value.scrollHeight;
      }
    });
  }
}

function formatMB(bytes) {
  if (!bytes) return '0 MB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatJson(val) {
  try {
    return JSON.stringify(typeof val === 'string' ? JSON.parse(val) : val, null, 2);
  } catch (_) {
    return val;
  }
}

async function handleTogglePause() {
  if (!props.adapter?.togglePause) return;
  togglingPause.value = true;
  try {
    const paused = await props.adapter.togglePause();
    isPaused.value = paused;
    addLog('info', `[Console] Curator Engine ${paused ? 'Paused ⏸' : 'Resumed ▶'}`);
  } catch (err) {
    addLog('error', `[Console] Pause toggle failed: ${err.message}`);
  } finally {
    togglingPause.value = false;
  }
}

async function handleExportDatabase() {
  if (!props.adapter?.exportDatabase) return;
  exporting.value = true;
  addLog('info', '[Console] Preparing SQLite database export...');
  try {
    await props.adapter.exportDatabase();
    addLog('ok', '[Console] Database export completed successfully.');
  } catch (err) {
    addLog('error', `[Console] Export failed: ${err.message}`);
  } finally {
    exporting.value = false;
  }
}

function triggerFileInput() {
  if (fileInputRef.value) fileInputRef.value.click();
}

async function handleFileSelected(e) {
  const file = e.target?.files?.[0];
  if (!file || !props.adapter?.importDatabase) return;
  if (!confirm(`Import '${file.name}' (${(file.size / (1024 * 1024)).toFixed(2)} MB) into storage? This will replace the current database and reload.`)) {
    e.target.value = '';
    return;
  }

  importing.value = true;
  addLog('info', `[Console] Importing database: ${file.name}...`);
  try {
    await props.adapter.importDatabase(file);
    addLog('ok', '[Console] Import successful! Reloading page...');
    setTimeout(() => window.location.reload(), 600);
  } catch (err) {
    addLog('error', `[Console] Import failed: ${err.message}`);
    importing.value = false;
  }
}

async function handleResetDatabase() {
  if (!props.adapter?.resetDatabase) return;
  if (!confirm('Permanently wipe local storage and reload clean database? Continue?')) return;
  resetting.value = true;
  addLog('info', '[Console] Resetting database...');
  try {
    const success = await props.adapter.resetDatabase();
    if (success) {
      addLog('ok', '[Console] Database reset. Reloading...');
      setTimeout(() => window.location.reload(), 400);
    } else {
      addLog('error', '[Console] Reset failed.');
      resetting.value = false;
    }
  } catch (err) {
    addLog('error', `[Console] Reset error: ${err.message}`);
    resetting.value = false;
  }
}

async function fetchAgents() {
  if (!props.adapter?.requestGraphql) return;
  try {
    const data = await props.adapter.requestGraphql(`
      query GetCuratorAgentsSummary {
        curatorAgents {
          id
          name
          schedule
          isActive
          enabled
          lastRunAt
          episodesCount
          tracksCount
        }
      }
    `);
    agents.value = data.curatorAgents || [];
  } catch (err) {
    console.warn('[Console] Failed to fetch agents:', err.message);
  }
}

async function fetchRequests() {
  if (!props.adapter?.requestGraphql) return;
  loadingRequests.value = true;
  try {
    const data = await props.adapter.requestGraphql(`
      query GetCuratorRequestsSummary($limit: Int) {
        curatorRequests(limit: $limit) {
          id
          scriptId
          parentId
          notifyId
          toolName
          status
          retryCount
          ast
          context
          scheduledAt
          createdAt
          updatedAt
          agentName
          responses {
            id
            requestId
            content
            createdAt
          }
        }
      }
    `, { limit: requestLimit.value });
    requests.value = data.curatorRequests || [];
  } catch (err) {
    console.warn('[Console] Failed to fetch requests:', err.message);
  } finally {
    loadingRequests.value = false;
  }
}

function toggleRequestNodeCollapse(id) {
  const next = new Set(collapsedRequestNodes.value);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  collapsedRequestNodes.value = next;
}

function expandAllRequestNodes() {
  collapsedRequestNodes.value = new Set();
}

function collapseAllRequestNodes() {
  const ids = new Set();
  for (const req of requests.value) {
    if (req.id) ids.add(String(req.id));
  }
  collapsedRequestNodes.value = ids;
}

function parseAstNodeInfo(rawAst) {
  let astObj = null;
  let astJson = '';
  if (typeof rawAst === 'string') {
    astJson = rawAst;
    try {
      astObj = JSON.parse(rawAst);
    } catch {
      astObj = { raw: rawAst };
    }
  } else if (rawAst && typeof rawAst === 'object') {
    astObj = rawAst;
    try {
      astJson = JSON.stringify(rawAst, null, 2);
    } catch {
      astJson = String(rawAst);
    }
  }

  const nodeType = astObj?.type || 'AST Task';
  const toolName = astObj?.toolName || astObj?.name;
  let summary = '';

  if (astObj?.args) {
    const a = astObj.args;
    if (a.url) summary = a.url;
    else if (a.program?.title) summary = `Program: ${a.program.title}`;
    else if (a.episode?.title) summary = `Episode: ${a.episode.title}`;
    else if (a.seriesId) summary = `Series #${a.seriesId}`;
    else if (a.query) summary = `Query: ${a.query}`;
    else {
      const keys = Object.keys(a);
      if (keys.length > 0) {
        summary = keys.map(k => `${k}: ${typeof a[k] === 'object' ? '{...}' : a[k]}`).slice(0, 3).join(', ');
      }
    }
  } else if (astObj?.iterator) {
    summary = `Iterate over: ${astObj.iterator}`;
  } else if (astObj?.steps && Array.isArray(astObj.steps)) {
    summary = `${astObj.steps.length} sequence steps`;
  }

  return {
    nodeType,
    toolName,
    summary,
    astJson: astJson || (astObj ? JSON.stringify(astObj, null, 2) : '{}'),
  };
}

const requestTree = computed(() => {
  if (!requests.value || requests.value.length === 0) return [];

  const nodeMap = new Map();

  for (const raw of requests.value) {
    const idStr = String(raw.id);
    const { nodeType, toolName, summary, astJson } = parseAstNodeInfo(raw.ast);
    let contextJson = null;
    if (raw.context) {
      contextJson = typeof raw.context === 'string' ? raw.context : JSON.stringify(raw.context, null, 2);
    }

    let durationMs = null;
    if (raw.createdAt && raw.updatedAt) {
      const created = new Date(raw.createdAt).getTime();
      const updated = new Date(raw.updatedAt).getTime();
      if (updated >= created) {
        durationMs = updated - created;
      }
    }

    const node = {
      id: idStr,
      raw,
      parentId: raw.parentId ? String(raw.parentId) : null,
      notifyId: raw.notifyId ? String(raw.notifyId) : null,
      agentName: raw.agentName || 'unknown',
      status: raw.status || 'pending',
      nodeType,
      toolName: toolName || raw.toolName,
      summary,
      astJson,
      contextJson,
      createdAt: raw.createdAt,
      scheduledAt: raw.scheduledAt,
      updatedAt: raw.updatedAt,
      durationMs,
      retryCount: raw.retryCount || 0,
      depth: 0,
      children: [],
    };
    nodeMap.set(idStr, node);
  }

  const rootNodes = [];

  for (const [idStr, node] of nodeMap) {
    const directParent = node.parentId && nodeMap.has(node.parentId) && node.parentId !== idStr
      ? nodeMap.get(node.parentId)
      : null;
    const notifyParent = !directParent && node.notifyId && nodeMap.has(node.notifyId) && node.notifyId !== idStr
      ? nodeMap.get(node.notifyId)
      : null;
    const parent = directParent || notifyParent;

    if (parent) {
      parent.children.push(node);
    } else {
      rootNodes.push(node);
    }
  }

  function setupDepthAndSort(nodes, depth = 0) {
    for (const n of nodes) {
      n.depth = depth;
      if (n.children.length > 0) {
        n.children.sort((a, b) => {
          const tA = a.createdAt ? new Date(a.createdAt).getTime() : Number(a.id) || 0;
          const tB = b.createdAt ? new Date(b.createdAt).getTime() : Number(b.id) || 0;
          return tA - tB;
        });
        setupDepthAndSort(n.children, depth + 1);
      }
    }
  }

  setupDepthAndSort(rootNodes, 0);

  const q = requestSearchQuery.value.trim().toLowerCase();
  const statusFilter = requestStatusFilter.value;

  if (!q && statusFilter === 'all') {
    return rootNodes;
  }

  function matchesFilter(node) {
    const matchesQuery = !q || (
      node.id.toLowerCase().includes(q) ||
      node.agentName.toLowerCase().includes(q) ||
      (node.toolName && node.toolName.toLowerCase().includes(q)) ||
      node.nodeType.toLowerCase().includes(q) ||
      node.summary.toLowerCase().includes(q) ||
      node.status.toLowerCase().includes(q)
    );

    const matchesStatus = statusFilter === 'all' || (
      (statusFilter === 'completed' && node.status.toLowerCase() === 'completed') ||
      (statusFilter === 'failed' && node.status.toLowerCase() === 'failed') ||
      (statusFilter === 'active' && ['new', 'pending', 'running', 'waiting'].includes(node.status.toLowerCase()))
    );

    return matchesQuery && matchesStatus;
  }

  function filterTree(nodes) {
    const result = [];
    for (const node of nodes) {
      const filteredChildren = filterTree(node.children);
      const isSelfMatch = matchesFilter(node);
      if (isSelfMatch || filteredChildren.length > 0) {
        result.push({
          ...node,
          children: filteredChildren,
        });
      }
    }
    return result;
  }

  return filterTree(rootNodes);
});

async function fetchStats() {
  if (props.adapter?.getDatabaseHealth) {
    try {
      curatorHealth.value = await props.adapter.getDatabaseHealth();
    } catch (_) {}
  } else if (props.adapter?.requestGraphql) {
    try {
      const data = await props.adapter.requestGraphql(`
        query GetCuratorHealth {
          curatorDatabaseHealth {
            storageEngine
            isOpfs
            tables {
              name
              rowCount
            }
            requestsTotal
            requestsCompleted
            requestsFailed
            requestsPending
            agentsTotal
            agentsActive
          }
        }
      `);
      if (data?.curatorDatabaseHealth) {
        curatorHealth.value = data.curatorDatabaseHealth;
      }
    } catch (_) {}
  }

  if (props.adapter?.getStorageInfo) {
    try {
      storageInfo.value = await props.adapter.getStorageInfo();
    } catch (_) {}
  } else if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    try {
      const est = await navigator.storage.estimate();
      storageInfo.value = { usage: est.usage || 0, quota: est.quota || 0 };
    } catch (_) {}
  }
}

async function triggerAgent(agent) {
  if (!props.adapter?.triggerAgent) return;
  if (!agent.isActive && !agent.enabled) {
    addLog('warn', `[Console] Cannot trigger '${agent.name}': agent is disabled. Please enable it first.`);
    return;
  }
  runningAgents.value.add(agent.id);
  addLog('info', `[Console] Triggering agent: ${agent.name}...`);
  try {
    await props.adapter.triggerAgent(agent.id);
    addLog('ok', `[Console] Enqueued task for: ${agent.name}`);
    setTimeout(() => {
      fetchRequests();
      fetchAgents();
      fetchStats();
    }, 1200);
  } catch (err) {
    addLog('error', `[Console] Failed to trigger: ${err.message}`);
    runningAgents.value.delete(agent.id);
  }
}

async function deleteAgent(agent) {
  if (!confirm(`Are you sure you want to delete agent '${agent.name}' along with its script?`)) return;
  deletingAgents.value.add(agent.id);
  addLog('info', `[Console] Deleting agent '${agent.name}'...`);
  try {
    if (props.adapter?.deleteAgent) {
      await props.adapter.deleteAgent(agent.id);
    } else if (props.adapter?.requestGraphql) {
      await props.adapter.requestGraphql(`
        mutation DeleteAgent($id: ID!) {
          deleteAgent(id: $id)
        }
      `, { id: agent.id });
    }
    addLog('ok', `[Console] Agent '${agent.name}' soft-deleted.`);
    await fetchAgents();
    await fetchRequests();
  } catch (err) {
    addLog('error', `[Console] Failed to delete agent: ${err.message}`);
  } finally {
    deletingAgents.value.delete(agent.id);
  }
}

async function toggleAgent(agent) {
  if (!props.adapter?.requestGraphql && !props.adapter?.toggleAgent) return;
  const previousActive = Boolean(agent.isActive ?? agent.enabled);
  const newState = !previousActive;

  // Optimistically toggle state in UI immediately for instant feedback
  agent.isActive = newState;
  agent.enabled = newState;
  togglingAgents.value.add(agent.id);
  addLog('info', `[Console] ${newState ? 'Enabling' : 'Disabling'} agent: ${agent.name}...`);

  try {
    if (props.adapter?.toggleAgent) {
      await props.adapter.toggleAgent(agent.id, newState);
    } else {
      await props.adapter.requestGraphql(`
        mutation ToggleCuratorAgent($id: ID!, $isActive: Boolean!) {
          toggleCuratorAgent(id: $id, isActive: $isActive) {
            id name isActive enabled schedule
          }
        }
      `, { id: agent.id, isActive: newState });
    }
    addLog('ok', `[Console] Agent ${agent.name} ${newState ? 'enabled ✔' : 'disabled ✗'}`);
    await fetchAgents();
  } catch (err) {
    // Revert optimistic state on failure
    agent.isActive = previousActive;
    agent.enabled = previousActive;
    addLog('error', `[Console] Toggle failed: ${err.message}`);
  } finally {
    togglingAgents.value.delete(agent.id);
  }
}

async function saveSchedule(agent) {
  const newSchedule = (editingSchedule.value[agent.id] ?? agent.schedule ?? '').trim();
  if (!newSchedule || newSchedule === agent.schedule) return;
  if (!props.adapter?.requestGraphql) return;
  addLog('info', `[Console] Updating schedule for ${agent.name}: ${newSchedule}`);
  try {
    await props.adapter.requestGraphql(`
      mutation UpdateAgentSchedule($id: ID!, $schedule: String!) {
        updateAgentSchedule(id: $id, schedule: $schedule) {
          id name schedule
        }
      }
    `, { id: agent.id, schedule: newSchedule });
    addLog('ok', `[Console] Schedule updated: ${agent.name} → ${newSchedule}`);
    delete editingSchedule.value[agent.id];
    await fetchAgents();
  } catch (err) {
    addLog('error', `[Console] Schedule update failed: ${err.message}`);
  }
}

function formatRelativeTime(dateStr) {
  if (!dateStr || dateStr === 'Never') return 'Never';
  try {
    const d = new Date(dateStr);
    const diffMs = Date.now() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    return `${Math.floor(diffH / 24)}d ago`;
  } catch (_) {
    return dateStr;
  }
}

onMounted(async () => {
  addLog('info', '[Console] Curator Dev Console mounted.');

  if (props.adapter?.onProgress) {
    unsubProgress = props.adapter.onProgress((type, payload) => {
      if (type === 'log') {
        addLog('info', payload?.message || String(payload));
      } else if (type === 'step_start' || type === 'episode_start') {
        currentJob.value = payload;
        addLog('info', `[Step] ${payload.title || payload.name || payload.episodeTitle || 'Working...'}`);
      } else if (type === 'step_progress' || type === 'episode') {
        currentJob.value = {
          title: payload.title || payload.episodeTitle || `Item ${payload.index || 1}/${payload.total || 1}`,
          percent: payload.total ? Math.round(((payload.index || 1) / payload.total) * 100) : 0,
        };
        addLog('ok', `[Progress ${payload.index || 1}/${payload.total || 1}] ${payload.title || payload.episodeTitle || 'Processing'}`);
      } else if (type === 'stats') {
        addLog('info', `[Job] ${payload.message || JSON.stringify(payload)}`);
      } else if (type === 'step_done' || type === 'episode_done') {
        addLog('ok', `[Step Done] ${payload.message || 'Completed'}`);
      } else if (type === 'done' || type === 'complete') {
        currentJob.value = null;
        runningAgents.value.clear();
        addLog('ok', `[CuratorEngine] Task completed: ${payload?.title || payload?.programTitle || 'Done'}`);
        fetchAgents();
        fetchStats();
        fetchRequests();
      } else if (type === 'request_start') {
        addLog('info', `[CuratorEngine] Request ${payload?.requestId} started`);
        fetchRequests();
      } else if (type === 'request_done') {
        addLog(payload?.success ? 'ok' : 'error', `[CuratorEngine] Request ${payload?.requestId} ${payload?.success ? 'completed' : 'failed'}`);
        fetchRequests();
      } else if (type === 'postmessage_tx') {
        addLog('tx', `[Worker TX ➔] ${payload?.type || 'MESSAGE'}`);
      } else if (type === 'postmessage_rx') {
        addLog('rx', `[Worker RX ⬅] ${payload?.type || 'MESSAGE'}`);
      } else if (type === 'error') {
        addLog('error', payload?.message || String(payload));
        runningAgents.value.clear();
      }
    });
  }

  if (props.adapter?.getProcessorState) {
    try {
      isPaused.value = await props.adapter.getProcessorState();
    } catch (_) {}
  }

  if (props.adapter?.onDatabaseChange) {
    unsubDbChange = props.adapter.onDatabaseChange((info) => {
      const tables = info?.tables || [];
      const hasAll = tables.includes('all');
      if (hasAll || tables.includes('requests')) fetchRequests();
      if (hasAll || tables.includes('agents')) fetchAgents();
      if (hasAll || tables.includes('stats') || tables.includes('episodes')) fetchStats();
    });
  }

  fetchAgents();
  fetchRequests();
  fetchStats();
});

onUnmounted(() => {
  if (unsubProgress) unsubProgress();
  if (unsubDbChange) unsubDbChange();
});

watch(activeTab, (tab) => {
  if (tab === 'agents') fetchAgents();
  else if (tab === 'requests') fetchRequests();
  else if (tab === 'storage') fetchStats();
});

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      fetchAgents();
      fetchRequests();
      fetchStats();
    }
  }
);
</script>

<style scoped>
.curator-console-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(2px);
  z-index: 99999;
  display: flex;
  justify-content: flex-end;
  animation: console-fade-in 0.15s ease-out;
}

.curator-console-drawer {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #090d16;
  color: #f1f5f9;
  border-left: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: -10px 0 36px rgba(0, 0, 0, 0.65);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  animation: console-slide-in 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
  max-width: 100vw;
  transition: width 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.curator-console-drawer.is-fullscreen {
  width: 100vw !important;
  max-width: 100vw !important;
  border-left: none;
  box-shadow: none;
}

@keyframes console-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes console-slide-in {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}

.d-flex { display: flex; }
.align-center { align-items: center; }
.gap-2 { gap: 8px; }
.w-100 { width: 100%; }

/* Header */
.console-header {
  padding: 14px 18px;
  background: rgba(15, 23, 42, 0.95);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.console-title-group {
  display: flex;
  flex-direction: column;
}

.console-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: #f8fafc;
  display: flex;
  align-items: center;
}

.console-subtitle {
  font-size: 0.72rem;
  color: #94a3b8;
  margin-top: 2px;
}

.engine-pulse-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  display: inline-block;
}

.dot-active {
  background: #10b981;
  box-shadow: 0 0 8px #10b981;
  animation: pulse 2s infinite;
}

.dot-paused {
  background: #f59e0b;
  box-shadow: 0 0 8px #f59e0b;
}

@keyframes pulse {
  0% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.15); }
  100% { opacity: 1; transform: scale(1); }
}

.console-badge {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 999px;
  letter-spacing: 0.05em;
}

.badge-active {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.4);
}

.badge-paused {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.4);
}

.console-header-actions {
  display: flex;
  gap: 6px;
}

.icon-action-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #cbd5e1;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  transition: all 0.15s;
}

.icon-action-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
}

/* Toolbar */
.console-toolbar {
  padding: 10px 14px;
  background: rgba(15, 23, 42, 0.6);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.toolbar-left {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}

.btn-ctl {
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.btn-pause {
  background: #f59e0b;
  color: #1e293b;
  border: none;
}
.btn-pause:hover { background: #d97706; }

.btn-resume {
  background: #10b981;
  color: #064e3b;
  border: none;
}
.btn-resume:hover { background: #059669; color: #fff; }

.btn-export {
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.3);
}
.btn-export:hover { background: rgba(56, 189, 248, 0.25); color: #7dd3fc; }

.btn-import {
  background: rgba(168, 85, 247, 0.15);
  color: #c084fc;
  border: 1px solid rgba(168, 85, 247, 0.3);
}
.btn-import:hover { background: rgba(168, 85, 247, 0.25); color: #d8b4fe; }

.btn-reset {
  background: rgba(239, 68, 68, 0.12);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.3);
}
.btn-reset:hover { background: rgba(239, 68, 68, 0.25); color: #fca5a5; }

.storage-pill {
  font-size: 0.68rem;
  color: #94a3b8;
  background: rgba(255, 255, 255, 0.05);
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

/* Progress banner */
.console-progress-banner {
  padding: 8px 14px;
  background: rgba(30, 41, 59, 0.8);
  border-bottom: 1px solid rgba(56, 189, 248, 0.2);
}

.prog-bar-track {
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  overflow: hidden;
}

.prog-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #38bdf8, #10b981);
  transition: width 0.3s ease;
}

/* Tabs */
.console-tabs {
  display: flex;
  background: #0b1120;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  overflow-x: auto;
}

.tab-btn {
  padding: 9px 14px;
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.tab-btn:hover { color: #f8fafc; }
.tab-btn.active {
  color: #38bdf8;
  border-bottom-color: #38bdf8;
  background: rgba(56, 189, 248, 0.04);
}

.tab-count {
  font-size: 0.65rem;
  background: rgba(255, 255, 255, 0.1);
  padding: 1px 5px;
  border-radius: 999px;
  color: #cbd5e1;
}

/* Body */
.console-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

/* Tab 1: Logs */
.log-panel {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 190px);
}

.log-controls-subbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  gap: 6px;
}

.filter-input {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 4px 8px;
  border-radius: 4px;
  color: #f8fafc;
  font-size: 0.72rem;
  width: 200px;
}

.filter-input:focus {
  outline: none;
  border-color: #38bdf8;
}

.sub-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #cbd5e1;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.7rem;
  cursor: pointer;
}
.sub-btn.active { background: rgba(56, 189, 248, 0.2); color: #38bdf8; }
.text-danger { color: #f87171 !important; }

.log-terminal {
  flex: 1;
  background: #020617;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 10px;
  overflow-y: auto;
  font-size: 0.75rem;
  line-height: 1.5;
}

.log-empty {
  color: #64748b;
  text-align: center;
  padding: 24px;
}

.log-row {
  display: flex;
  gap: 8px;
  margin-bottom: 3px;
  word-break: break-word;
}

.log-time {
  color: #475569;
  flex-shrink: 0;
  font-size: 0.7rem;
}

.log-info .log-text { color: #cbd5e1; }
.log-ok .log-text { color: #34d399; }
.log-error .log-text { color: #f87171; font-weight: 600; }
.log-warn .log-text { color: #fbbf24; }
.log-tx .log-text { color: #38bdf8; font-weight: 600; }
.log-rx .log-text { color: #a7f3d0; }

/* Tab 2: Agents */
.panel-desc {
  font-size: 0.75rem;
  color: #94a3b8;
  margin-bottom: 10px;
}

.agents-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.agent-compact-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 10px 12px;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: border-color 0.2s;
}

.agent-compact-card:hover {
  border-color: rgba(255, 255, 255, 0.15);
}

.agent-disabled {
  opacity: 0.6;
  border-color: rgba(255, 255, 255, 0.04) !important;
}

.ag-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ag-title {
  font-weight: 600;
  font-size: 0.82rem;
  color: #f1f5f9;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.ag-status-badge {
  font-size: 0.6rem;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 999px;
  letter-spacing: 0.04em;
}
.badge-enabled {
  background: rgba(16, 185, 129, 0.18);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.3);
}
.badge-disabled {
  background: rgba(100, 116, 139, 0.18);
  color: #94a3b8;
  border: 1px solid rgba(100, 116, 139, 0.25);
}

.ag-cron-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.ag-cron-label {
  font-size: 0.68rem;
  color: #64748b;
  flex-shrink: 0;
}

.ag-cron-input {
  font-family: ui-monospace, monospace;
  font-size: 0.7rem;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  color: #7dd3fc;
  padding: 2px 6px;
  width: 130px;
  outline: none;
  transition: border-color 0.15s;
}
.ag-cron-input:focus {
  border-color: #38bdf8;
  background: rgba(56, 189, 248, 0.05);
}

.ag-last-run {
  font-size: 0.65rem;
  color: #64748b;
}

.ag-actions-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ag-toggle-btn {
  padding: 3px 9px;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid;
  transition: all 0.15s;
  flex-shrink: 0;
}
.ag-btn-enable {
  background: rgba(16, 185, 129, 0.12);
  color: #34d399;
  border-color: rgba(16, 185, 129, 0.35);
}
.ag-btn-enable:hover { background: rgba(16, 185, 129, 0.25); }
.ag-btn-disable {
  background: rgba(239, 68, 68, 0.08);
  color: #f87171;
  border-color: rgba(239, 68, 68, 0.25);
}
.ag-btn-disable:hover { background: rgba(239, 68, 68, 0.18); }
.ag-toggle-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.ag-run-btn {
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.3);
  padding: 3px 10px;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s;
}
.ag-run-btn:hover:not(:disabled) { background: #38bdf8; color: #0f172a; }
.ag-run-btn:disabled { opacity: 0.35; cursor: not-allowed; }

.ag-delete-btn {
  background: rgba(239, 68, 68, 0.1);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.25);
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s;
}
.ag-delete-btn:hover:not(:disabled) { background: rgba(239, 68, 68, 0.25); border-color: #ef4444; color: #fca5a5; }
.ag-delete-btn:disabled { opacity: 0.35; cursor: not-allowed; }

/* Tab 3: Requests & Hierarchical Tree */
.requests-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.requests-toolbar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.06);
  padding: 8px 10px;
  border-radius: 6px;
}

.req-search-group {
  display: flex;
  align-items: center;
  position: relative;
  width: 100%;
}

.req-search-input {
  width: 100%;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  padding: 5px 26px 5px 8px;
  color: #f1f5f9;
  font-size: 0.72rem;
  outline: none;
  transition: border-color 0.15s;
}

.req-search-input:focus {
  border-color: #38bdf8;
  background: rgba(56, 189, 248, 0.04);
}

.clear-search-btn {
  position: absolute;
  right: 6px;
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 0.7rem;
  cursor: pointer;
  padding: 2px;
}
.clear-search-btn:hover { color: #f87171; }

.req-status-filters {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.filter-pill {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #94a3b8;
  font-size: 0.68rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.15s;
}

.filter-pill:hover {
  color: #f8fafc;
  border-color: rgba(255, 255, 255, 0.2);
}

.filter-pill.active {
  background: rgba(56, 189, 248, 0.15);
  border-color: #38bdf8;
  color: #38bdf8;
}

.status-pill-active.active {
  background: rgba(245, 158, 11, 0.18);
  border-color: #f59e0b;
  color: #fbbf24;
}

.status-pill-completed.active {
  background: rgba(16, 185, 129, 0.18);
  border-color: #10b981;
  color: #34d399;
}

.status-pill-failed.active {
  background: rgba(239, 68, 68, 0.18);
  border-color: #ef4444;
  color: #f87171;
}

.req-actions-group {
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: flex-end;
}

.primary-sub-btn {
  background: rgba(56, 189, 248, 0.15) !important;
  color: #38bdf8 !important;
  border-color: rgba(56, 189, 248, 0.3) !important;
  font-weight: 700 !important;
}
.primary-sub-btn:hover {
  background: #38bdf8 !important;
  color: #0f172a !important;
}

.requests-tree-view {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 20px;
}

/* Tab 4: Health */
.health-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 12px;
}

.health-card h4 {
  margin: 0 0 8px 0;
  font-size: 0.82rem;
  color: #f8fafc;
}

.health-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: #94a3b8;
  padding: 4px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.health-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.h-metric {
  background: rgba(255, 255, 255, 0.02);
  padding: 8px;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
}

.h-val {
  font-size: 1.1rem;
  font-weight: 700;
  color: #38bdf8;
}

.h-lbl {
  font-size: 0.68rem;
  color: #64748b;
}

.gap-2 { gap: 8px; }
.mt-3 { margin-top: 12px; }
.mt-2 { margin-top: 8px; }
.w-100 { width: 100%; justify-content: center; }

.health-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.72rem;
  margin-top: 6px;
}
.health-table th {
  text-align: left;
  color: #64748b;
  padding: 4px 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  font-weight: 600;
}
.health-table td {
  padding: 5px 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
  color: #cbd5e1;
}
.health-table tr:hover td {
  background: rgba(255, 255, 255, 0.02);
}
.table-count-badge {
  color: #38bdf8;
  font-family: ui-monospace, monospace;
  font-weight: 600;
}
.text-warning {
  color: #fbbf24;
}
</style>
