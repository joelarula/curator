<template>
  <div class="summary-tab">
    <div class="summary-section">
      <h2>📊 ERR Radio Program Breakdown &amp; Agent Progress</h2>
      <p class="summary-sub">
        Curator Engine drives scraping of new episodes &amp; tracks into local WASM SQLite.
        Each program card is tightly coupled to its agent — hit "Run Agent" to index.
      </p>
    </div>

    <!-- Hero Stats Row -->
    <div class="summary-hero">
      <div class="stat-card accent">
        <div class="stat-num">{{ (totals.uniqueTracks || 0).toLocaleString() }}</div>
        <div class="stat-lbl">Unique Songs</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">{{ (totals.tracks || 0).toLocaleString() }}</div>
        <div class="stat-lbl">Total Airings</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">{{ (totals.episodes || 0).toLocaleString() }}</div>
        <div class="stat-lbl">Episodes</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">{{ (totals.programs || 0).toLocaleString() }}</div>
        <div class="stat-lbl">Programs</div>
      </div>
    </div>

    <!-- Live Agent Log -->
    <div v-if="agentLog.length > 0" class="agent-log-panel">
      <div class="agent-log-header">
        <span>🤖 Curator Engine Log</span>
        <button class="log-clear-btn" @click="agentLog = []" type="button">Clear</button>
      </div>
      <div class="agent-log-body" ref="logBody">
        <div v-for="(entry, i) in agentLog" :key="i" :class="['log-line', entry.type]">
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
          <div class="ep-progress-fill" :style="{ width: (currentEpisode.index / currentEpisode.total * 100) + '%' }"></div>
        </div>
      </div>
    </div>

    <!-- Program Cards Grid -->
    <div v-if="loading" class="text-center py-6 text-medium-emphasis">
      Loading program progress...
    </div>

    <div v-else-if="breakdown.length === 0" class="text-center text-medium-emphasis py-4">
      No program breakdown available yet.
    </div>

    <div v-else class="program-grid">
      <div v-for="prog in breakdown" :key="prog.programId" class="program-card" :class="{ 'is-running': isRunning(prog) }">
        <div class="prog-header">
          <div>
            <h3>{{ prog.programTitle }}</h3>
            <span class="text-caption text-medium-emphasis">ID: {{ prog.programId }}</span>
          </div>
          <button
            class="action-btn"
            type="button"
            :disabled="isRunning(prog)"
            @click="triggerAgent(prog)"
          >
            <span v-if="isRunning(prog)">⚙ Indexing...</span>
            <span v-else>▶ Run Agent</span>
          </button>
        </div>

        <div class="prog-metrics">
          <div class="metric">
            <span class="m-val">{{ (prog.episodes || 0).toLocaleString() }}</span>
            <span class="m-lbl">Episodes</span>
          </div>
          <div class="metric">
            <span class="m-val">{{ (prog.tracks || 0).toLocaleString() }}</span>
            <span class="m-lbl">Tracks</span>
          </div>
          <div class="metric">
            <span class="m-val">{{ (prog.uniqueTracks || 0).toLocaleString() }}</span>
            <span class="m-lbl">Unique</span>
          </div>
        </div>

        <div class="prog-progress">
          <div class="prog-progress-bar">
            <div class="prog-progress-fill" :style="{ width: getProgressPct(prog) + '%' }"></div>
          </div>
          <span class="prog-pct">{{ getProgressPct(prog) }}% indexed</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, onActivated, onDeactivated, nextTick } from 'vue';
import { requestGraphql, onWorkerReady, enqueueAgent, onAgentProgress } from '@wasm/graphql-client.js';

const breakdown = ref([]);
const totals = ref({ episodes: 0, tracks: 0, uniqueTracks: 0, programs: 0 });
const loading = ref(false);
const agentLog = ref([]);
const currentEpisode = ref(null);
const logBody = ref(null);
const runningAgents = ref(new Set());

let pollInterval = null;
let unsubProgress = null;

function isRunning(prog) {
  return runningAgents.value.has(prog.programTitle) || runningAgents.value.has(prog.programId);
}

function getProgressPct(prog) {
  if (!prog.tracks || prog.tracks === 0) return 0;
  return Math.min(100, Math.max(0, Math.round((prog.uniqueTracks / prog.tracks) * 100)));
}

function addLog(type, text) {
  agentLog.value.push({ type, text: '[' + new Date().toLocaleTimeString() + '] ' + text });
  if (agentLog.value.length > 200) agentLog.value.splice(0, agentLog.value.length - 200);
  nextTick(() => {
    if (logBody.value) logBody.value.scrollTop = logBody.value.scrollHeight;
  });
}

const GQL_SUMMARY = 'query GetProgramSummary { stats { episodes tracks uniqueTracks programs programBreakdown { programId programTitle episodes tracks uniqueTracks } } }';

async function fetchSummary() {
  // Only show the spinner on the initial load; the 5s poll refetch updates in
  // place so the grid doesn't flash/unmount every tick.
  if (breakdown.value.length === 0) loading.value = true;
  try {
    const data = await requestGraphql(GQL_SUMMARY);
    if (data.stats) {
      totals.value = data.stats;
      breakdown.value = data.stats.programBreakdown || [];
    }
  } catch (err) {
    console.error('[ProgramSummary] Failed to fetch summary:', err);
  } finally {
    loading.value = false;
  }
}

async function triggerAgent(prog) {
  const title = prog.programTitle;
  runningAgents.value = new Set([...runningAgents.value, title]);
  addLog('info', '[CuratorEngine] Triggering agent for: ' + title);
  try {
    await enqueueAgent(title);
    addLog('info', '[CuratorEngine] Request enqueued for: ' + title);
  } catch (err) {
    addLog('error', '[CuratorEngine] Failed to enqueue: ' + err.message);
    runningAgents.value.delete(title);
    runningAgents.value = new Set(runningAgents.value);
  }
}

onMounted(() => {
  unsubProgress = onAgentProgress((eventType, payload) => {
    switch (eventType) {
      case 'log':
        addLog('info', payload);
        break;
      case 'error':
        addLog('error', payload);
        break;
      case 'episode':
        currentEpisode.value = payload;
        addLog('ok', 'Episode ' + payload.index + '/' + payload.total + ': ' + payload.episodeTitle + ' (' + payload.tracksCount + ' tracks)');
        break;
      case 'stats':
        addLog('info', '[Scraper] ' + payload.discovered + ' episodes found, ' + payload.toProcess + ' new to scrape');
        break;
      case 'done':
        currentEpisode.value = null;
        addLog('ok', 'Done! Parsed ' + payload.parsed + ' episodes, ' + payload.tracksSaved + ' tracks saved, ' + payload.failures + ' failures');
        runningAgents.value = new Set([...runningAgents.value].filter(n => n !== payload.programTitle));
        fetchSummary();
        break;
      case 'request_start':
        addLog('info', '[CuratorEngine] Request ' + payload.requestId + ' started');
        break;
      case 'request_done':
        addLog(payload.success ? 'ok' : 'error', '[CuratorEngine] Request ' + payload.requestId + ' ' + (payload.success ? 'completed' : 'failed'));
        break;
    }
  });
});

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval);
  if (unsubProgress) unsubProgress();
});

// KeepAlive keeps this component instance alive across tab switches. onActivated
// also fires on the initial mount, so it's the single place that starts polling.
onActivated(() => {
  if (!pollInterval) {
    onWorkerReady(() => {
      if (pollInterval) return; // already started, or deactivated again before this resolved
      fetchSummary();
      pollInterval = setInterval(fetchSummary, 5000);
    });
  }
});

onDeactivated(() => {
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
});
</script>


