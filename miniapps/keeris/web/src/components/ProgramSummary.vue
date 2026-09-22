<template>
  <div class="summary-tab">
    <div class="summary-section">
      <h2>{{ $t('programSummary.heading') }}</h2>
      <p class="summary-sub">{{ $t('programSummary.subtext') }}</p>
    </div>

cu
    <!-- Hero Stats Row -->
    <div class="summary-hero">
      <div class="stat-card accent">
        <div class="stat-num">{{ (totals.uniqueTracks || 0).toLocaleString() }}</div>
        <div class="stat-lbl">{{ $t('programSummary.statUnique') }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">{{ (totals.tracks || 0).toLocaleString() }}</div>
        <div class="stat-lbl">{{ $t('programSummary.statAirings') }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">{{ (totals.episodes || 0).toLocaleString() }}</div>
        <div class="stat-lbl">{{ $t('programSummary.statEpisodes') }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">{{ (totals.programs || 0).toLocaleString() }}</div>
        <div class="stat-lbl">{{ $t('programSummary.statPrograms') }}</div>
      </div>
    </div>

    <!-- Program Overview Cards Grid (No run controls, pure inspection & index navigation) -->
    <div v-if="loading && breakdown.length === 0" class="text-center py-6 text-medium-emphasis">
      {{ $t('programSummary.loadingPrograms') }}
    </div>

    <div v-else-if="breakdown.length === 0" class="text-center text-medium-emphasis py-4">
      {{ $t('programSummary.noBreakdown') }}
    </div>

    <div v-else class="program-grid">
      <div 
        v-for="prog in breakdown" 
        :key="prog.programId" 
        class="program-card clickable-card"
        :class="{ 'is-selected': selectedProgramId === String(prog.programId) }"
        @click="selectProgram(String(prog.programId))"
      >
        <div class="prog-header">
          <div>
            <h3>{{ prog.programTitle }}</h3>
            <span class="text-caption text-medium-emphasis">{{ $t('programSummary.seriesId', { id: prog.programId }) }}</span>
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

        <div class="prog-metrics">
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

        <div class="prog-progress">
          <div class="prog-progress-bar">
            <div class="prog-progress-fill" :style="{ width: getProgressPct(prog) + '%' }"></div>
          </div>
          <span class="prog-pct">{{ $t('programSummary.uniqueDensity', { pct: getProgressPct(prog) }) }}</span>
        </div>
      </div>
    </div>

    <!-- Episode Archive Index Feature -->
    <section class="episode-index-section" id="episode-index">
      <div class="episode-index-header">
        <div class="index-title-group">
          <h3>{{ $t('programSummary.episodeIndexTitle') }}</h3>
          <span class="index-subtitle">{{ $t('programSummary.episodeIndexSub') }}</span>
        </div>

        <!-- Program Filter Selector -->
        <div class="program-filter-chips">
          <button
            type="button"
            class="filter-chip"
            :class="{ active: selectedProgramId === '' }"
            @click="selectProgram('')"
          >
            {{ $t('programSummary.allShows', { n: (totals.episodes || 0).toLocaleString() }) }}
          </button>
          <button
            v-for="prog in breakdown"
            :key="prog.programId"
            type="button"
            class="filter-chip"
            :class="{ active: selectedProgramId === String(prog.programId) }"
            @click="selectProgram(String(prog.programId))"
          >
            {{ prog.programTitle }} ({{ (prog.episodes || 0).toLocaleString() }})
          </button>
        </div>
      </div>

      <!-- Episode Search and Stats Bar -->
      <div class="index-toolbar">
        <input
          type="search"
          v-model="episodeSearch"
          class="episode-search-input"
          :placeholder="$t('programSummary.filterEpisodesPlaceholder')"
          @input="onEpisodeSearchInput"
        />
        <div class="index-count-label">
          <template v-if="selectedProgramTitle">
            {{ $t('programSummary.showingEpisodesIn', { n: episodes.length }) }} <strong>{{ selectedProgramTitle }}</strong>
          </template>
          <template v-else>
            {{ $t('programSummary.showingEpisodes', { n: episodes.length }) }}
          </template>
        </div>
      </div>

      <!-- Episode Cards / List -->
      <div v-if="episodesLoading" class="text-center py-6 text-medium-emphasis">
        {{ $t('programSummary.loadingEpisodes') }}
      </div>

      <div v-else-if="episodes.length === 0" class="no-episodes-panel">
        <p>{{ $t('programSummary.noEpisodes') }}</p>
        <button v-if="selectedProgramId || episodeSearch" class="reset-filter-btn" @click="resetFilters">
          {{ $t('programSummary.resetFilters') }}
        </button>
      </div>

      <div v-else class="episode-list">
        <article
          v-for="ep in episodes"
          :key="ep.id"
          class="episode-card"
        >
          <div class="ep-top-row">
            <div class="ep-meta-badges">
              <span v-if="ep.program?.title" class="badge program-tag">{{ ep.program.title }}</span>
              <span class="badge date-tag">📅 {{ formatDate(ep.scheduledAt || ep.publishedAt) }}</span>
              <span class="badge track-count-tag">🎵 {{ ep.trackCount }} track{{ ep.trackCount === 1 ? '' : 's' }}</span>
            </div>
          </div>

          <h4 class="ep-title">
            <router-link :to="`/episode/${ep.id}`" class="ep-title-link">
              {{ ep.title }}
            </router-link>
          </h4>

          <p v-if="ep.metadata?.summary || ep.metadata?.description" class="ep-desc">
            {{ ep.metadata?.summary || ep.metadata?.description }}
          </p>

          <div class="ep-actions-row">
            <!-- Direct external link to ERR broadcast episode audio -->
            <a
              :href="ep.url"
              target="_blank"
              rel="noreferrer"
              class="ep-btn ep-btn-primary"
              :title="$t('programSummary.listenOnErr')"
            >
              <span>{{ $t('programSummary.listenOnErr') }}</span>
              <span class="arrow-icon">↗</span>
            </a>

            <!-- Dedicated Episode Page -->
            <router-link
              :to="`/episode/${ep.id}`"
              class="ep-btn ep-btn-secondary"
            >
              <span>{{ $t('programSummary.episodePage') }}</span>
              <span class="arrow-icon">➔</span>
            </router-link>

            <!-- Inline Tracklist Inspection Toggle -->
            <button
              type="button"
              class="ep-btn ep-btn-ghost"
              @click="toggleEpisodeTracks(ep.id)"
            >
              <span>{{ expandedEpId === ep.id ? $t('programSummary.hideTracklist') : $t('programSummary.inspectTracklist') }}</span>
            </button>
          </div>

          <!-- Inline Episode Tracklist -->
          <div v-if="expandedEpId === ep.id" class="inline-tracklist">
            <div v-if="tracksLoading" class="tracklist-loading">{{ $t('programSummary.loadingTracks') }}</div>
            <div v-else-if="episodeTracks.length === 0" class="tracklist-empty">{{ $t('programSummary.noTracks') }}</div>
            <div v-else class="tracklist-table-wrap">
              <table class="tracklist-table">
                <thead>
                  <tr>
                    <th style="width: 45px;">#</th>
                    <th>{{ $t('programSummary.thArtist') }}</th>
                    <th>{{ $t('programSummary.thSongTitle') }}</th>
                    <th style="width: 90px;">{{ $t('programSummary.thAction') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="t in episodeTracks" :key="t.id">
                    <td class="track-num">{{ t.position }}</td>
                    <td class="track-artist"><strong>{{ t.artist || '—' }}</strong></td>
                    <td class="track-title">{{ t.title || t.rawText }}</td>
                    <td>
                      <router-link
                        :to="{ path: '/', query: { search: t.title || t.artist || '' } }"
                        class="track-find-link"
                      >
                        {{ $t('programSummary.searchLink') }}
                      </router-link>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </article>
      </div>
    </section>
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
  padding: 4px 8px;
  border-radius: 4px;
  background: var(--stats-bg);
  color: var(--text-secondary);
  white-space: nowrap;
}

.view-chip.active {
  background: var(--accent);
  color: #fff;
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
