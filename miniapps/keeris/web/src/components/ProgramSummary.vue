<template>
  <div class="summary-tab">
    <div class="summary-section">
      <h2>📊 ERR Radio Program Breakdown & Agent Progress</h2>
      <p class="summary-sub">
        Monitor local WASM database counts and trigger program-coupled Curator AST Agents to scrape & index new episodes and tracks.
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

    <!-- Program Cards Grid -->
    <div v-if="loading" class="text-center py-6 text-medium-emphasis">
      Loading program progress...
    </div>

    <div v-else-if="breakdown.length === 0" class="text-center text-medium-emphasis py-4">
      No program breakdown available yet.
    </div>

    <div v-else class="program-grid">
      <div v-for="prog in breakdown" :key="prog.programId" class="program-card">
        <div class="prog-header">
          <div>
            <h3>{{ prog.programTitle }}</h3>
            <span class="text-caption text-medium-emphasis">ID: {{ prog.programId }}</span>
          </div>
          <button
            class="action-btn"
            type="button"
            :disabled="runningAgent[prog.programTitle]"
            @click="triggerAgentForProgram(prog.programTitle)"
          >
            {{ runningAgent[prog.programTitle] ? 'Indexing...' : 'Run Agent' }}
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
            <div
              class="prog-progress-fill"
              :style="{ width: getProgressPercentage(prog) + '%' }"
            ></div>
          </div>
          <span class="prog-pct">{{ getProgressPercentage(prog) }}% indexed</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { requestGraphql, onWorkerReady } from '@wasm/graphql-client.js';

const breakdown = ref([]);
const totals = ref({ episodes: 0, tracks: 0, uniqueTracks: 0, programs: 0 });
const loading = ref(false);
const runningAgent = ref({});
let pollInterval = null;

function getProgressPercentage(prog) {
  if (!prog.tracks || prog.tracks === 0) return 0;
  const pct = Math.round((prog.uniqueTracks / prog.tracks) * 100);
  return Math.min(Math.max(pct, 0), 100);
}

async function fetchSummary() {
  loading.value = true;
  try {
    const data = await requestGraphql(`
      query GetProgramSummary {
        stats {
          episodes
          tracks
          uniqueTracks
          programs
          programBreakdown {
            programId
            programTitle
            episodes
            tracks
            uniqueTracks
          }
        }
      }
    `);

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

async function triggerAgentForProgram(programTitle) {
  runningAgent.value[programTitle] = true;
  try {
    const agentName = `${programTitle.toLowerCase().replace(/[^a-z0-9]/g, '_')}_agent`;
    await requestGraphql(`
      mutation TriggerAgent($agentName: String!) {
        triggerCuratorAgent(agentName: $agentName) {
          id
          status
        }
      }
    `, { agentName });

    // Refresh metrics over next 3 seconds as worker indexes
    let checks = 0;
    const t = setInterval(async () => {
      await fetchSummary();
      checks++;
      if (checks >= 3) {
        clearInterval(t);
        runningAgent.value[programTitle] = false;
      }
    }, 1000);
  } catch (err) {
    console.error('[ProgramSummary] Agent trigger failed:', err);
    runningAgent.value[programTitle] = false;
  }
}

onMounted(() => {
  onWorkerReady(() => {
    fetchSummary();
  });
});

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval);
});
</script>
