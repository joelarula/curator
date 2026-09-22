<template>
  <div class="summary-tab">
    <div class="summary-section">
      <h2>{{ $t('programSummary.heading') }}</h2>
      <p class="summary-sub">{{ $t('programSummary.subtext') }}</p>
    </div>

    <!-- Hero Stats Row (Vuetify responsive grid: 2x2 on mobile, 4 in row on desktop) -->
    <v-row class="mb-3" dense>
      <v-col cols="6" sm="6" md="3">
        <div class="stat-card accent h-100">
          <div class="stat-num">{{ (totals.uniqueTracks || 0).toLocaleString() }}</div>
          <div class="stat-lbl">{{ $t('programSummary.statUnique') }}</div>
        </div>
      </v-col>
      <v-col cols="6" sm="6" md="3">
        <div class="stat-card h-100">
          <div class="stat-num">{{ (totals.tracks || 0).toLocaleString() }}</div>
          <div class="stat-lbl">{{ $t('programSummary.statAirings') }}</div>
        </div>
      </v-col>
      <v-col cols="6" sm="6" md="3">
        <div class="stat-card h-100">
          <div class="stat-num">{{ (totals.episodes || 0).toLocaleString() }}</div>
          <div class="stat-lbl">{{ $t('programSummary.statEpisodes') }}</div>
        </div>
      </v-col>
      <v-col cols="6" sm="6" md="3">
        <div class="stat-card h-100">
          <div class="stat-num">{{ (totals.programs || 0).toLocaleString() }}</div>
          <div class="stat-lbl">{{ $t('programSummary.statPrograms') }}</div>
        </div>
      </v-col>
    </v-row>

    <!-- Program Overview Cards Grid (Vuetify responsive grid: 1 col on mobile, 2 on tablet, 3 on desktop) -->
    <div v-if="loading && breakdown.length === 0" class="text-center py-6 text-medium-emphasis">
      {{ $t('programSummary.loadingPrograms') }}
    </div>

    <div v-else-if="breakdown.length === 0" class="text-center text-medium-emphasis py-4">
      {{ $t('programSummary.noBreakdown') }}
    </div>

    <v-row v-else dense>
      <v-col
        v-for="prog in breakdown"
        :key="prog.programId"
        cols="12"
        sm="6"
        md="4"
      >
        <div 
          class="program-card clickable-card h-100"
          :class="{ 'is-selected': selectedProgramId === String(prog.programId) }"
          @click="selectProgram(String(prog.programId))"
        >
          <div class="prog-header">
            <div>
              <h3>{{ prog.programTitle }}</h3>
            </div>
            <div class="d-flex align-center ga-1" @click.stop>
              <router-link
                :to="`/program/${prog.programId}`"
                class="view-chip active"
                title="Explore broadcast program archive"
              >
                {{ $t('programSummary.exploreProgram') }}
              </router-link>
            </div>
          </div>

          <div class="prog-metrics mt-3">
            <div class="metric">
              <span class="m-val">{{ (prog.episodes || 0).toLocaleString() }}</span>
              <span class="m-lbl">{{ $t('programSummary.statEpisodes') }}</span>
            </div>
            <div class="metric">
              <span class="m-val">{{ (prog.tracks || 0).toLocaleString() }}</span>
              <span class="m-lbl">{{ $t('programSummary.statAirings') }}</span>
            </div>
            <div class="metric">
              <span class="m-val">{{ (prog.uniqueTracks || 0).toLocaleString() }}</span>
              <span class="m-lbl">{{ $t('programSummary.statUnique') }}</span>
            </div>
          </div>

          <div class="prog-progress mt-3">
            <div class="prog-progress-bar">
              <div class="prog-progress-fill" :style="{ width: getProgressPct(prog) + '%' }"></div>
            </div>
            <span class="prog-pct">{{ $t('programSummary.uniqueDensity', { pct: getProgressPct(prog) }) }}</span>
          </div>
        </div>
      </v-col>
    </v-row>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, onActivated } from 'vue';
import { useI18n } from 'vue-i18n';
import { requestGraphql, onWorkerReady, onAgentProgress, onDatabaseChange } from '@wasm/graphql-client';
import type { ProgramBreakdown, EpisodeGql, EpisodeTrackGql } from '@wasm/types';

const { t: _t } = useI18n();

const breakdown = ref<ProgramBreakdown[]>([]);
const totals = ref({ episodes: 0, tracks: 0, uniqueTracks: 0, programs: 0 });
const loading = ref(false);

const selectedProgramId = ref('');
const episodeSearch = ref('');
const episodes = ref<EpisodeGql[]>([]);
const episodesLoading = ref(false);
const expandedEpId = ref<string | null>(null);
const episodeTracks = ref<EpisodeTrackGql[]>([]);
const tracksLoading = ref(false);

let searchDebounce: ReturnType<typeof setTimeout> | null = null;
let unsubProgress: (() => void) | null = null;
let unsubDbChange: (() => void) | null = null;
let liveRefreshTimer: ReturnType<typeof setTimeout> | null = null;

const selectedProgramTitle = computed(() => {
  if (!selectedProgramId.value) return '';
  const p = breakdown.value.find(b => String(b.programId) === String(selectedProgramId.value));
  return p ? p.programTitle : '';
});

function getProgressPct(prog) {
  if (!prog.tracks || prog.tracks === 0) return 0;
  return Math.min(100, Math.max(0, Math.round((prog.uniqueTracks / prog.tracks) * 100)));
}

function formatDate(iso) {
  if (!iso) return 'Recent';
  try {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso.slice(0, 10) : d.toLocaleDateString();
  } catch (_) {
    return String(iso).slice(0, 10);
  }
}

const GQL_SUMMARY = `
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
`;

const GQL_EPISODES = `
  query GetEpisodes($search: String, $programId: ID, $limit: Int) {
    episodes(search: $search, programId: $programId, limit: $limit) {
      id
      url
      title
      scheduledAt
      publishedAt
      parseStatus
      trackCount
      program {
        id
        title
      }
      metadata {
        summary
        description
      }
    }
  }
`;

const GQL_EPISODE_TRACKS = `
  query GetEpisodeTracks($episodeId: ID) {
    tracks(episodeId: $episodeId, limit: 100) {
      id
      position
      artist
      title
      rawText
    }
  }
`;

async function fetchSummary() {
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

async function fetchEpisodes() {
  if (episodes.value.length === 0) episodesLoading.value = true;
  try {
    const vars = {
      search: episodeSearch.value ? episodeSearch.value.trim() : null,
      programId: selectedProgramId.value || null,
      limit: 100
    };
    const data = await requestGraphql(GQL_EPISODES, vars);
    episodes.value = data.episodes || [];
  } catch (err) {
    console.error('[ProgramSummary] Failed to fetch episodes:', err);
  } finally {
    episodesLoading.value = false;
  }
}

function selectProgram(progId) {
  selectedProgramId.value = progId;
  expandedEpId.value = null;
  fetchEpisodes();
}

function resetFilters() {
  selectedProgramId.value = '';
  episodeSearch.value = '';
  expandedEpId.value = null;
  fetchEpisodes();
}

function onEpisodeSearchInput() {
  if (searchDebounce) clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    fetchEpisodes();
  }, 220);
}

async function toggleEpisodeTracks(epId) {
  if (expandedEpId.value === epId) {
    expandedEpId.value = null;
    episodeTracks.value = [];
    return;
  }
  expandedEpId.value = epId;
  tracksLoading.value = true;
  episodeTracks.value = [];
  try {
    const data = await requestGraphql(GQL_EPISODE_TRACKS, { episodeId: epId });
    episodeTracks.value = data.tracks || [];
  } catch (err) {
    console.error('[ProgramSummary] Failed to load episode tracks:', err);
  } finally {
    tracksLoading.value = false;
  }
}

function refreshAllData() {
  if (liveRefreshTimer) clearTimeout(liveRefreshTimer);
  liveRefreshTimer = setTimeout(() => {
    fetchSummary();
    fetchEpisodes();
    if (expandedEpId.value) {
      toggleEpisodeTracks(expandedEpId.value);
    }
  }, 350);
}

onMounted(() => {
  onWorkerReady(() => {
    fetchSummary();
    fetchEpisodes();
  });

  // Reactive change push from the worker thread
  unsubDbChange = onDatabaseChange(() => {
    refreshAllData();
  });

  // Agent progress events
  unsubProgress = onAgentProgress((eventType, payload) => {
    if (eventType === 'done' || eventType === 'complete' || eventType === 'episode') {
      refreshAllData();
    } else if (eventType === 'request_done' && payload?.success) {
      refreshAllData();
    }
  });
});

onUnmounted(() => {
  if (unsubDbChange) unsubDbChange();
  if (unsubProgress) unsubProgress();
  if (liveRefreshTimer) clearTimeout(liveRefreshTimer);
  if (searchDebounce) clearTimeout(searchDebounce);
});

onActivated(() => {
  fetchSummary();
  fetchEpisodes();
});
</script>

<style scoped>
.clickable-card {
  cursor: pointer;
  border: 1px solid var(--border-default);
  background: var(--bg-surface);
  transition: all 0.18s ease;
}

.clickable-card:hover {
  transform: translateY(-2px);
  border-color: var(--accent);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.clickable-card.is-selected {
  border-color: var(--accent);
  background: var(--bg-elevated);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 25%, transparent);
}

.view-chip {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 4px;
  background: var(--stats-bg);
  color: var(--text-primary);
  text-decoration: none;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  transition: all 0.15s ease;
}

.view-chip.active {
  background: var(--accent);
  color: #fff !important;
}

.view-chip.active:hover {
  background: var(--accent-hover);
  color: #fff !important;
}

/* Episode Index Section */
.episode-index-section {
  margin-top: 36px;
  border-top: 1px solid var(--border-default);
  padding-top: 24px;
}

.episode-index-header {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.index-title-group h3 {
  font-size: 1.25rem;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.index-subtitle {
  color: var(--text-secondary);
  font-size: 0.88rem;
}

.program-filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.filter-chip {
  border: 1px solid var(--border-default);
  background: var(--bg-chip);
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.filter-chip:hover {
  border-color: var(--accent);
  color: var(--text-primary);
}

.filter-chip.active {
  background: var(--nav-active-bg);
  color: var(--nav-active-text);
  border-color: var(--nav-active-bg);
}

/* Index Toolbar */
.index-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 18px;
  flex-wrap: wrap;
}

.episode-search-input {
  flex: 1;
  min-width: 280px;
  background: var(--bg-input);
  border: 1px solid var(--border-default);
  color: var(--text-primary);
  border-radius: 4px;
  padding: 8px 12px;
  font-family: inherit;
  font-size: 0.9rem;
  outline: none;
}

.episode-search-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 25%, transparent);
}

.index-count-label {
  font-size: 0.85rem;
  color: var(--text-muted);
}

/* Episode List */
.episode-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.episode-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: box-shadow 0.15s ease, border-color 0.15s ease;
}

.episode-card:hover {
  border-color: var(--accent);
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.08);
}

.ep-meta-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.badge {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 3px 7px;
  border-radius: 4px;
}

.badge.program-tag {
  background: var(--stats-bg);
  color: var(--text-primary);
}

.badge.date-tag {
  background: var(--bg-elevated);
  color: var(--text-secondary);
  border: 1px solid var(--border-subtle);
}

.badge.track-count-tag {
  background: var(--bg-elevated);
  color: var(--accent);
  border: 1px solid var(--border-subtle);
}

.ep-title {
  font-size: 1.05rem;
  color: var(--text-primary);
  margin: 0;
  line-height: 1.35;
}

.ep-desc {
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.45;
}

.ep-actions-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}

.ep-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.78rem;
  font-weight: 700;
  padding: 6px 12px;
  border-radius: 4px;
  text-decoration: none;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
}

.ep-btn-primary {
  background: var(--accent);
  color: #fff;
}

.ep-btn-primary:hover {
  background: var(--accent-hover);
}

.ep-btn-secondary {
  background: var(--nav-active-bg);
  color: var(--nav-active-text);
}

.ep-btn-secondary:hover {
  background: var(--accent);
  color: #fff;
}

.ep-btn-ghost {
  background: var(--stats-bg);
  color: var(--text-primary);
}

.ep-btn-ghost:hover {
  background: var(--border-default);
}

.arrow-icon {
  font-size: 0.85rem;
}

/* Inline Tracklist */
.inline-tracklist {
  margin-top: 10px;
  padding: 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: 4px;
}

.tracklist-loading,
.tracklist-empty {
  font-size: 0.85rem;
  color: var(--text-muted);
  text-align: center;
  padding: 8px 0;
}

.tracklist-table-wrap {
  overflow-x: auto;
}

.tracklist-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.83rem;
}

.tracklist-table th {
  text-align: left;
  padding: 6px 8px;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border-default);
  font-weight: 700;
}

.tracklist-table td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-primary);
}

.track-num {
  font-weight: 700;
  color: var(--text-muted);
}

.track-find-link {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--accent);
  text-decoration: none;
}

.track-find-link:hover {
  text-decoration: underline;
}

.no-episodes-panel {
  background: var(--bg-surface);
  border: 1px dashed var(--border-default);
  padding: 30px;
  text-align: center;
  color: var(--text-muted);
  border-radius: 6px;
}

.reset-filter-btn {
  margin-top: 8px;
  background: var(--nav-active-bg);
  color: var(--nav-active-text);
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  font-weight: 700;
  cursor: pointer;
}
</style>
