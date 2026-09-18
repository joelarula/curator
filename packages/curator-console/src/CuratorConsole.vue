<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="curator-console-overlay"
      @click.self="$emit('update:modelValue', false)"
    >
      <aside
        class="curator-console-drawer"
        :style="{ width: drawerWidth + 'px' }"
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
        <button class="icon-action-btn" title="Toggle full width" @click="toggleExpanded">
          {{ isExpanded ? '🗗' : '🗖' }}
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
          Trigger any Curator Agent workflow directly into the AST execution queue:
        </div>
        <div v-if="agents.length === 0" class="log-empty">
          No registered Curator agents found.
        </div>
        <div v-else class="agents-grid">
          <div v-for="ag in agents" :key="ag.id" class="agent-compact-card">
            <div class="ag-meta">
              <div class="ag-title">{{ ag.name }}</div>
              <div class="ag-sub" v-if="ag.schedule">
                Cron: <code>{{ ag.schedule }}</code>
                <span v-if="ag.episodesCount !== undefined"> • {{ ag.episodesCount }} eps</span>
              </div>
            </div>
            <button
              v-if="adapter?.triggerAgent"
              class="ag-run-btn"
              :disabled="runningAgents.has(ag.id)"
              @click="triggerAgent(ag)"
            >
              {{ runningAgents.has(ag.id) ? '⚙ Running...' : '▶ Run' }}
            </button>
          </div>
        </div>
      </div>

      <!-- 3. AST REQUESTS TAB -->
      <div v-if="activeTab === 'requests'" class="tab-panel requests-panel">
        <div class="d-flex align-center justify-space-between mb-2">
          <span class="panel-desc">Processed AST tasks in Curator requests table:</span>
          <button class="sub-btn" @click="fetchRequests">↻ Refresh</button>
        </div>
        <div v-if="requests.length === 0" class="log-empty">
          No AST workflow execution requests logged yet.
        </div>
        <div v-else class="requests-list">
          <div v-for="req in requests" :key="req.id" class="request-card">
            <div class="req-header">
              <span class="req-id">{{ req.id }}</span>
              <span class="req-status" :class="'status-' + req.status">{{ req.status }}</span>
            </div>
            <div class="req-date">{{ req.createdAt }}</div>
            <details class="req-ast-details">
              <summary>AST Node</summary>
              <pre class="ast-json">{{ formatJson(req.ast) }}</pre>
            </details>
            <div v-if="req.responses && req.responses.length" class="req-responses">
              <div v-for="resp in req.responses" :key="resp.id" class="resp-box">
                {{ resp.content }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 4. STORAGE & HEALTH TAB -->
      <div v-if="activeTab === 'storage'" class="tab-panel storage-panel">
        <div class="health-card">
          <h4>Curator Storage Environment</h4>
          <div class="health-row" v-if="storageInfo.usage">
            <span>Disk Usage:</span>
            <strong>{{ formatMB(storageInfo.usage) }}</strong>
          </div>
          <div class="health-row" v-if="storageInfo.quota">
            <span>Disk Quota:</span>
            <strong>{{ formatMB(storageInfo.quota) }}</strong>
          </div>
          <div class="health-row">
            <span>Status:</span>
            <strong class="text-success">Connected</strong>
          </div>
        </div>

        <div class="health-card mt-3" v-if="Object.keys(dbStats).length">
          <h4>Database Metrics</h4>
          <div class="health-grid">
            <div v-for="(val, key) in dbStats" :key="key" class="h-metric">
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
const storageInfo = ref({ usage: 0, quota: 0 });
const dbStats = ref({});

let unsubProgress = null;

const drawerWidth = computed(() => {
  if (isExpanded.value) return Math.min(window.innerWidth - 40, 960);
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
          episodesCount
          tracksCount
          lastRunAt
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
  try {
    const data = await props.adapter.requestGraphql(`
      query GetCuratorRequestsSummary {
        curatorRequests(limit: 20) {
          id
          ast
          status
          createdAt
          responses {
            id
            content
            createdAt
          }
        }
      }
    `);
    requests.value = data.curatorRequests || [];
  } catch (err) {
    console.warn('[Console] Failed to fetch requests:', err.message);
  }
}

async function fetchStats() {
  if (!props.adapter?.requestGraphql) return;
  try {
    const data = await props.adapter.requestGraphql(`
      query GetConsoleStats {
        stats {
          episodes
          tracks
          uniqueTracks
          programs
        }
      }
    `);
    dbStats.value = data.stats || {};
  } catch (_) {}

  if (props.adapter?.getStorageInfo) {
    try {
      storageInfo.value = await props.adapter.getStorageInfo();
    } catch (_) {}
  } else if (navigator.storage && navigator.storage.estimate) {
    try {
      const est = await navigator.storage.estimate();
      storageInfo.value = { usage: est.usage || 0, quota: est.quota || 0 };
    } catch (_) {}
  }
}

async function triggerAgent(agent) {
  if (!props.adapter?.triggerAgent) return;
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

onMounted(async () => {
  addLog('info', '[Console] Curator Dev Console mounted.');

  if (props.adapter?.onProgress) {
    unsubProgress = props.adapter.onProgress((type, payload) => {
      if (type === 'log') {
        addLog('info', payload?.message || String(payload));
      } else if (type === 'episode_start' || type === 'step_start') {
        currentJob.value = payload;
        addLog('info', `[Step] ${payload.title || payload.episodeTitle || 'Working...'}`);
      } else if (type === 'episode') {
        currentJob.value = {
          title: `Episode ${payload.index}/${payload.total}: ${payload.episodeTitle}`,
          percent: Math.round((payload.index / payload.total) * 100),
        };
        addLog('ok', `[Episode ${payload.index}/${payload.total}] ${payload.episodeTitle} (${payload.tracksCount} tracks)`);
      } else if (type === 'stats') {
        addLog('info', `[Scraper] ${payload.discovered} episodes discovered, ${payload.toProcess} to scrape`);
      } else if (type === 'episode_done' || type === 'step_done') {
        addLog('ok', `[Step Done] ${payload.tracksCount ? payload.tracksCount + ' tracks' : 'Completed'}`);
      } else if (type === 'done' || type === 'complete') {
        currentJob.value = null;
        runningAgents.value.clear();
        addLog('ok', `[CuratorEngine] Task completed: ${payload?.programTitle || 'Done'} (${payload?.parsed ?? ''} parsed, ${payload?.tracksSaved ?? ''} tracks saved)`);
        fetchAgents();
        fetchStats();
        fetchRequests();
      } else if (type === 'request_start') {
        addLog('info', `[CuratorEngine] Request ${payload?.requestId} started`);
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
    unsubDbChange = props.adapter.onDatabaseChange(() => {
      fetchRequests();
      fetchAgents();
      fetchStats();
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
  padding: 8px 12px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ag-title {
  font-weight: 600;
  font-size: 0.82rem;
  color: #f1f5f9;
}

.ag-sub {
  font-size: 0.7rem;
  color: #94a3b8;
}

.ag-run-btn {
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.3);
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
}
.ag-run-btn:hover { background: #38bdf8; color: #0f172a; }
.ag-run-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* Tab 3: Requests */
.requests-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.request-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 8px 12px;
}

.req-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.req-id {
  font-size: 0.75rem;
  color: #38bdf8;
  font-weight: 600;
}

.req-status {
  font-size: 0.65rem;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 700;
  text-transform: uppercase;
}

.status-completed { background: rgba(16, 185, 129, 0.2); color: #34d399; }
.status-pending { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
.status-running { background: rgba(56, 189, 248, 0.2); color: #38bdf8; }
.status-failed { background: rgba(239, 68, 68, 0.2); color: #f87171; }

.req-date {
  font-size: 0.68rem;
  color: #64748b;
  margin: 3px 0;
}

.req-ast-details summary {
  font-size: 0.7rem;
  color: #94a3b8;
  cursor: pointer;
}

.ast-json {
  background: #020617;
  padding: 8px;
  border-radius: 4px;
  font-size: 0.68rem;
  color: #94a3b8;
  max-height: 120px;
  overflow-y: auto;
  margin-top: 4px;
}

.resp-box {
  background: rgba(16, 185, 129, 0.05);
  border: 1px solid rgba(16, 185, 129, 0.2);
  padding: 6px;
  border-radius: 4px;
  font-size: 0.7rem;
  color: #6ee7b7;
  margin-top: 6px;
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
</style>
