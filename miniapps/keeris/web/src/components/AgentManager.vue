<template>
  <div class="agent-manager">

    <div class="summary-section">
      <h2>🤖 Program Agents &amp; Scrapers Control</h2>
      <p class="summary-sub">
        Toggle individual ERR program scraper agents on or off. Active agents run background AST
        workflow tasks in the WASM Web Worker on OPFS SQLite. Hit <strong>Run Now</strong> to
        immediately trigger the Curator Engine for any program.
      </p>
      <button class="danger-btn" type="button" :disabled="resetting" @click="handleResetDatabase">
        {{ resetting ? '⏳ Resetting...' : '🗑 Reset Database (start fresh)' }}
      </button>
    </div>

    <!-- Live Engine Log -->
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
          <div class="ep-progress-fill"
               :style="{ width: Math.round(currentEpisode.index / currentEpisode.total * 100) + '%' }">
          </div>
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
              @change="toggleAgent(agent, $event.target.checked)"
            />
            <span class="toggle-slider"></span>
          </label>
        </div>

        <div class="agent-status-row">
          <span class="agent-status-badge" :class="agent.isActive ? 'badge-active' : 'badge-off'">
            {{ agent.isActive ? '● ACTIVE' : '○ OFF' }}
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

        <button
          class="action-btn run-btn"
          type="button"
          :disabled="isRunning(agent)"
          @click="runAgent(agent)"
        >
          <span v-if="isRunning(agent)">⚙ Scraping...</span>
          <span v-else>▶ Run Now</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { requestGraphql, onWorkerReady, enqueueAgent, onAgentProgress, resetDatabase } from '@wasm/graphql-client.js';

const agents = ref([]);
const resetting = ref(false);
const loading = ref(false);
const toggling = ref({});
const agentLog = ref([]);
const currentEpisode = ref(null);
const logBody = ref(null);
const runningAgents = ref(new Set());
let unsubProgress = null;

const GQL_AGENTS = 'query GetAgentsSummary { curatorAgents { id name schedule isActive episodesCount tracksCount lastRunAt } }';
const GQL_TOGGLE = 'mutation ToggleAgent($id: ID!, $isActive: Boolean!) { toggleCuratorAgent(id: $id, isActive: $isActive) { id isActive } }';

function isRunning(agent) {
  return runningAgents.value.has(agent.id) || runningAgents.value.has(agent.name);
}

function formatDate(isoStr) {
  if (!isoStr || isoStr === 'Never') return 'Never run';
  try { return new Date(isoStr).toLocaleString(); } catch (_) { return isoStr; }
}

function addLog(type, text) {
  agentLog.value.push({ type, text: '[' + new Date().toLocaleTimeString() + '] ' + text });
  if (agentLog.value.length > 300) agentLog.value.splice(0, agentLog.value.length - 300);
  nextTick(() => { if (logBody.value) logBody.value.scrollTop = logBody.value.scrollHeight; });
}

async function fetchAgents() {
  // Only show the spinner on the initial load; refetches (toggle/progress) update in place
  if (agents.value.length === 0) loading.value = true;
  try {
    const data = await requestGraphql(GQL_AGENTS);
    agents.value = data.curatorAgents || [];
  } catch (err) {
    addLog('error', '[AgentManager] Failed to load agents: ' + err.message);
  } finally {
    loading.value = false;
  }
}

async function handleResetDatabase() {
  if (!confirm('This will permanently delete the local OPFS database (all scraped episodes/tracks) and reload the page. Continue?')) return;
  resetting.value = true;
  addLog('info', '[AgentManager] Resetting local database...');
  try {
    const success = await resetDatabase();
    if (success) {
      addLog('ok', '[AgentManager] Database reset. Reloading...');
      window.location.reload();
    } else {
      addLog('error', '[AgentManager] Reset failed - see console for details.');
      resetting.value = false;
    }
  } catch (err) {
    addLog('error', '[AgentManager] Reset failed: ' + err.message);
    resetting.value = false;
  }
}

async function toggleAgent(agent, newStatus) {
  toggling.value[agent.id] = true;
  try {
    await requestGraphql(GQL_TOGGLE, { id: agent.id, isActive: newStatus });
    await fetchAgents();
    addLog('info', '[AgentManager] ' + agent.name + (newStatus ? ' enabled' : ' disabled'));
  } catch (err) {
    addLog('error', '[AgentManager] Toggle failed: ' + err.message);
  } finally {
    toggling.value[agent.id] = false;
  }
}

async function runAgent(agent) {
  runningAgents.value = new Set([...runningAgents.value, agent.id, agent.name]);
  addLog('info', '[CuratorEngine] Triggering: ' + agent.name + ' (id: ' + agent.id + ')');
  try {
    await enqueueAgent(agent.id);
    addLog('info', '[CuratorEngine] Request enqueued for: ' + agent.name);
  } catch (err) {
    addLog('error', '[CuratorEngine] Failed: ' + err.message);
    const next = new Set(runningAgents.value);
    next.delete(agent.id);
    next.delete(agent.name);
    runningAgents.value = next;
  }
}

onMounted(() => {
  onWorkerReady(() => { fetchAgents(); });

  unsubProgress = onAgentProgress((eventType, payload) => {
    if (eventType === 'log') { addLog('info', payload); return; }
    if (eventType === 'error') { addLog('error', payload); return; }
    if (eventType === 'episode') {
      currentEpisode.value = payload;
      addLog('ok', 'Episode ' + payload.index + '/' + payload.total + ': ' + payload.episodeTitle + ' (' + payload.tracksCount + ' tracks)');
      return;
    }
    if (eventType === 'stats') {
      addLog('info', '[Scraper] ' + payload.discovered + ' episodes found, ' + payload.toProcess + ' to scrape');
      return;
    }
    if (eventType === 'done') {
      currentEpisode.value = null;
      addLog('ok', 'Done! ' + payload.parsed + ' episodes, ' + payload.tracksSaved + ' tracks, ' + payload.failures + ' failures');
      const next = new Set(runningAgents.value);
      next.delete(payload.programTitle);
      agents.value.forEach(a => { if (a.name === payload.programTitle) next.delete(a.id); });
      runningAgents.value = next;
      fetchAgents();
      return;
    }
    if (eventType === 'request_start') {
      addLog('info', '[CuratorEngine] Request ' + payload.requestId + ' started');
      return;
    }
    if (eventType === 'request_done') {
      addLog(payload.success ? 'ok' : 'error',
        '[CuratorEngine] Request ' + payload.requestId + ' ' + (payload.success ? 'completed' : 'failed'));
      if (payload.success) fetchAgents();
    }
  });
});

onUnmounted(() => { if (unsubProgress) unsubProgress(); });
</script>
