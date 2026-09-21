<template>
  <div class="agent-manager">
    <div class="summary-section">
      <h2>🤖 Program Agents &amp; Scrapers</h2>
      <p class="summary-sub">
        Toggle individual ERR program scraper agents on or off. Active agents run background AST
        workflow tasks in the WASM Web Worker on OPFS SQLite. Hit <strong>Run Now</strong> to
        immediately trigger an agent. For live AST logs, engine pause/resume, and request inspection,
        open the <strong>🤖 Dev Console</strong> in the header.
      </p>
    </div>

    <!-- Engine Pause / Resume Banner -->
    <div class="engine-control-bar">
      <span class="engine-status-dot" :class="isPaused ? 'dot-paused' : 'dot-live'"></span>
      <span class="engine-status-label">{{ isPaused ? '⏸ Engine Paused' : '⚡ Engine Running' }}</span>
      <button
        class="pause-btn"
        :class="isPaused ? 'pause-btn-resume' : 'pause-btn-pause'"
        type="button"
        :disabled="pauseToggling"
        @click="togglePause"
      >
        {{ isPaused ? '▶ Resume' : '⏸ Pause' }}
      </button>
    </div>

    <!-- Live Scraper Activity Log & Progress -->
    <div v-if="scraperLogs.length > 0" class="agent-log-panel">
      <div class="agent-log-header">
        <span>🤖 Live Scraper Activity</span>
        <button class="log-clear-btn" @click="scraperLogs = []" type="button">Clear</button>
      </div>
      <div class="agent-log-body" ref="logBodyRef">
        <div v-for="(entry, i) in scraperLogs" :key="i" :class="['log-line', entry.type]">
          {{ entry.text }}
        </div>
      </div>
      <div v-if="currentEpisode" class="episode-progress">
        <span class="ep-prog-label">
          Episode {{ currentEpisode.index }}/{{ currentEpisode.total }} —
          <strong>{{ currentEpisode.episodeTitle }}</strong>
          ({{ currentEpisode.tracksCount }} tracks)
        </span>
        <div class="ep-progress-bar">
          <div
            class="ep-progress-fill"
            :style="{ width: Math.round((currentEpisode.index / currentEpisode.total) * 100) + '%' }"
          ></div>
        </div>
      </div>
    </div>

    <div v-if="loading" class="agent-loading">Loading agents...</div>

    <div v-else class="program-grid">
      <div
        v-for="agent in agents"
        :key="agent.id"
        class="program-card"
        :class="{ 'is-running': isRunning(agent), 'agent-active': agent.isActive }"
      >
        <div class="prog-header">
          <div>
            <h3>{{ agent.name }}</h3>
            <span class="agent-cron">{{ agent.schedule }}</span>
          </div>
          <label class="toggle-switch" :title="agent.isActive ? 'Click to disable' : 'Click to enable'">
            <input
              type="checkbox"
              :checked="agent.isActive"
              :disabled="toggling[agent.id]"
              @change="toggleAgent(agent, !agent.isActive)"
            />
            <span class="toggle-slider"></span>
          </label>
        </div>

        <div class="agent-status-row">
          <span
            class="agent-status-badge"
            :class="{
              'badge-running': isRunning(agent),
              'badge-active': !isRunning(agent) && agent.isActive,
              'badge-off': !isRunning(agent) && !agent.isActive
            }"
          >
            {{ isRunning(agent) ? '⚙ SCRAPING' : (agent.isActive ? '● ACTIVE' : '○ OFF') }}
          </span>
          <span class="agent-last-run">{{ agent.lastRunAt === 'Never' ? 'Never run' : formatDate(agent.lastRunAt) }}</span>
        </div>

        <div class="prog-metrics">
          <div class="metric">
            <span class="m-val">{{ (agent.episodesCount || 0).toLocaleString() }}</span>
            <span class="m-lbl">Episodes</span>
          </div>
          <div class="metric">
            <span class="m-val">{{ (agent.tracksCount || 0).toLocaleString() }}</span>
            <span class="m-lbl">Tracks</span>
          </div>
          <div class="metric">
            <span class="m-val">{{ agent.isActive ? 'ON' : 'OFF' }}</span>
            <span class="m-lbl">State</span>
          </div>
        </div>

        <div class="card-action-row">
          <button
            v-if="!isRunning(agent)"
            class="action-btn run-btn"
            type="button"
            @click="runAgent(agent)"
          >
            ▶ Run Now
          </button>
          <template v-if="isRunning(agent)">
            <span class="card-running-label">⚙ Scraping...</span>
            <button
              class="action-btn pause-agent-btn"
              type="button"
              :disabled="pauseToggling"
              @click="togglePause"
            >
              {{ isPaused ? '▶ Resume' : '⏸ Pause' }}
            </button>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { 
  requestGraphql, 
  onWorkerReady, 
  enqueueAgent, 
  onAgentProgress,
  onDatabaseChange,
  toggleEnginepause,
  getEngineState,
} from '@wasm/graphql-client';

interface EpisodeProgress {
  index: number;
  total: number;
  episodeTitle: string;
  tracksCount: number;
  [key: string]: any;
}

interface CuratorAgent {
  id: string;
  name: string;
  schedule: string;
  isActive: boolean;
  episodesCount?: number;
  tracksCount?: number;
  lastRunAt?: string;
}

interface ScraperLogEntry {
  type: string;
  text: string;
}

const agents = ref<CuratorAgent[]>([]);
const loading = ref(false);
const toggling = ref<Record<string, boolean>>({});
const runningAgents = ref<Set<string>>(new Set());
const scraperLogs = ref<ScraperLogEntry[]>([]);
const currentEpisode = ref<EpisodeProgress | null>(null);
const logBodyRef = ref<HTMLElement | null>(null);
const isPaused = ref(false);
const pauseToggling = ref(false);
let unsubProgress: (() => void) | null = null;
let unsubDbChange: (() => void) | null = null;
let agentRefreshTimer: any = null;

const GQL_AGENTS = 'query GetAgentsSummary { curatorAgents { id name schedule isActive episodesCount tracksCount lastRunAt } }';
const GQL_TOGGLE = 'mutation ToggleAgent($id: ID!, $isActive: Boolean!) { toggleCuratorAgent(id: $id, isActive: $isActive) { id isActive } }';

function isRunning(agent: CuratorAgent) {
  return runningAgents.value.has(agent.id) || runningAgents.value.has(agent.name);
}

function formatDate(isoStr?: string | null) {
  if (!isoStr || isoStr === 'Never') return 'Never run';
  try { return new Date(isoStr).toLocaleString(); } catch (_) { return isoStr; }
}

function addLog(type: string, text: string) {
  scraperLogs.value.push({ type, text: `[${new Date().toLocaleTimeString()}] ${text}` });
  if (scraperLogs.value.length > 250) scraperLogs.value.splice(0, scraperLogs.value.length - 250);
  nextTick(() => {
    if (logBodyRef.value) logBodyRef.value.scrollTop = logBodyRef.value.scrollHeight;
  });
}

async function fetchAgents() {
  if (agents.value.length === 0) loading.value = true;
  try {
    const data = await requestGraphql(GQL_AGENTS);
    agents.value = data.curatorAgents || [];
  } catch (err: any) {
    console.error('[AgentManager] Failed to load agents:', err.message);
  } finally {
    loading.value = false;
  }
}

async function toggleAgent(agent: CuratorAgent, newStatus: boolean) {
  toggling.value[agent.id] = true;
  try {
    await requestGraphql(GQL_TOGGLE, { id: agent.id, isActive: newStatus });
    await fetchAgents();
  } catch (err: any) {
    console.error('[AgentManager] Toggle failed:', err.message);
  } finally {
    toggling.value[agent.id] = false;
  }
}

async function runAgent(agent: CuratorAgent) {
  runningAgents.value = new Set([...runningAgents.value, agent.id, agent.name]);
  addLog('info', `[CuratorEngine] Triggered: ${agent.name}`);
  try {
    await enqueueAgent(agent.id);
  } catch (err: any) {
    addLog('error', `[CuratorEngine] Trigger failed: ${err.message}`);
    const next = new Set(runningAgents.value);
    next.delete(agent.id);
    next.delete(agent.name);
    runningAgents.value = next;
  }
}

async function togglePause() {
  pauseToggling.value = true;
  try {
    const result = await toggleEnginepause();
    isPaused.value = typeof result === 'boolean' ? result : !isPaused.value;
    addLog('info', `[CuratorEngine] Engine ${isPaused.value ? '⏸ Paused' : '▶ Resumed'}`);
  } catch (err: any) {
    addLog('error', `[CuratorEngine] Pause toggle failed: ${err?.message || String(err)}`);
  } finally {
    pauseToggling.value = false;
  }
}

onMounted(() => {
  onWorkerReady(async () => {
    fetchAgents();
    try {
      const state = await getEngineState();
      isPaused.value = state ?? false;
    } catch (_) {}
  });

  unsubProgress = onAgentProgress((eventType, payload) => {
    if (eventType === 'log') {
      addLog('info', payload?.message || String(payload));
    } else if (eventType === 'error') {
      addLog('error', payload?.message || String(payload));
    } else if (eventType === 'episode') {
      currentEpisode.value = payload;
      addLog('ok', `Episode ${payload.index}/${payload.total ?? '?'}: ${payload.episodeTitle} (${payload.tracksCount} tracks)`);
    } else if (eventType === 'stats') {
      addLog('info', `[Scraper] ${payload.discovered} episodes found, ${payload.toProcess} to scrape`);
    } else if (eventType === 'complete' || eventType === 'done') {
      currentEpisode.value = null;
      addLog('ok', `Done! Parsed ${payload?.parsed ?? ''} episodes, ${payload?.tracksSaved ?? ''} tracks saved`);
      const next = new Set(runningAgents.value);
      if (payload?.programTitle) next.delete(payload.programTitle);
      agents.value.forEach(a => {
        if (payload?.programTitle && a.name === payload.programTitle) next.delete(a.id);
      });
      runningAgents.value = next;
      fetchAgents();
    } else if (eventType === 'request_start') {
      addLog('info', `[CuratorEngine] Request ${payload?.requestId} started`);
    } else if (eventType === 'request_done') {
      addLog(payload?.success ? 'ok' : 'error', `[CuratorEngine] Request ${payload?.requestId} ${payload?.success ? 'completed' : 'failed'}`);
      if (payload?.success) fetchAgents();
    }
  });

  unsubDbChange = onDatabaseChange(() => {
    if (agentRefreshTimer) clearTimeout(agentRefreshTimer);
    agentRefreshTimer = setTimeout(() => {
      fetchAgents();
    }, 400);
  });
});

onUnmounted(() => {
  if (unsubProgress) unsubProgress();
  if (unsubDbChange) unsubDbChange();
  if (agentRefreshTimer) clearTimeout(agentRefreshTimer);
});
</script>
