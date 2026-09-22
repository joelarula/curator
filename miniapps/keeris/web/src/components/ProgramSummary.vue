<template>
  <div class="summary-tab">
    <div class="summary-section">
      <h2>📊 ERR Radio Program &amp; Episode Archive Index</h2>
      <p class="summary-sub">
        Explore ERR radio programs and browse catalogued broadcast episodes. Navigate directly into ERR broadcast audio, or inspect songs and airings.
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

    <!-- Program Overview Cards Grid (No run controls, pure inspection & index navigation) -->
    <div v-if="loading && breakdown.length === 0" class="text-center py-6 text-medium-emphasis">
      Loading programs...
    </div>

    <div v-else-if="breakdown.length === 0" class="text-center text-medium-emphasis py-4">
      No program breakdown available yet.
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
            <span class="text-caption text-medium-emphasis">Series ID: {{ prog.programId }}</span>
          </div>
          <div class="d-flex align-center ga-1" @click.stop>
            <router-link
              :to="`/program/${prog.programId}`"
              class="view-chip active"
              title="Explore broadcast program archive"
            >
              Explore Program ➔
            </router-link>
          </div>
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
          <span class="prog-pct">{{ getProgressPct(prog) }}% unique density</span>
        </div>
      </div>
    </div>

    <!-- Episode Archive Index Feature -->
    <section class="episode-index-section" id="episode-index">
      <div class="episode-index-header">
        <div class="index-title-group">
          <h3>📻 Episode Archive Index</h3>
          <span class="index-subtitle">
            Browse episodes, jump into official ERR broadcast streams, or examine parsed tracklists.
          </span>
        </div>

        <!-- Program Filter Selector -->
        <div class="program-filter-chips">
          <button
            type="button"
            class="filter-chip"
            :class="{ active: selectedProgramId === '' }"
            @click="selectProgram('')"
          >
            All Shows ({{ (totals.episodes || 0).toLocaleString() }})
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
          placeholder="Filter episodes by date (e.g. 2024-09), title, or keywords..."
          @input="onEpisodeSearchInput"
        />
        <div class="index-count-label">
          Showing {{ episodes.length }} episode{{ episodes.length === 1 ? '' : 's' }}
          <span v-if="selectedProgramTitle"> in <strong>{{ selectedProgramTitle }}</strong></span>
        </div>
      </div>

      <!-- Episode Cards / List -->
      <div v-if="episodesLoading" class="text-center py-6 text-medium-emphasis">
        Loading episodes...
      </div>

      <div v-else-if="episodes.length === 0" class="no-episodes-panel">
        <p>No broadcast episodes found matching criteria.</p>
        <button v-if="selectedProgramId || episodeSearch" class="reset-filter-btn" @click="resetFilters">
          Reset filters
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
              title="Open broadcast on ERR Archive"
            >
              <span>Listen on ERR Archive</span>
              <span class="arrow-icon">↗</span>
            </a>

            <!-- Dedicated Episode Page -->
            <router-link
              :to="`/episode/${ep.id}`"
              class="ep-btn ep-btn-secondary"
            >
              <span>Episode Page</span>
              <span class="arrow-icon">➔</span>
            </router-link>

            <!-- Inline Tracklist Inspection Toggle -->
            <button
              type="button"
              class="ep-btn ep-btn-ghost"
              @click="toggleEpisodeTracks(ep.id)"
            >
              <span>{{ expandedEpId === ep.id ? '▲ Hide Tracklist' : '▼ Inspect Tracklist' }}</span>
            </button>
          </div>

          <!-- Inline Episode Tracklist -->
          <div v-if="expandedEpId === ep.id" class="inline-tracklist">
            <div v-if="tracksLoading" class="tracklist-loading">Loading tracks for episode...</div>
            <div v-else-if="episodeTracks.length === 0" class="tracklist-empty">No tracks indexed for this episode yet.</div>
            <div v-else class="tracklist-table-wrap">
              <table class="tracklist-table">
                <thead>
                  <tr>
                    <th style="width: 45px;">#</th>
                    <th>Artist</th>
                    <th>Song Title</th>
                    <th style="width: 90px;">Action</th>
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
                        Search ➔
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
import { requestGraphql, onWorkerReady, onAgentProgress, onDatabaseChange } from '@wasm/graphql-client';
import type { ProgramBreakdown, EpisodeGql, EpisodeTrackGql } from '@wasm/types';

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
  border: 1px solid #d8e2d7;
  transition: all 0.18s ease;
}

.clickable-card:hover {
  transform: translateY(-2px);
  border-color: #ef6a45;
  box-shadow: 0 4px 12px rgba(239, 106, 69, 0.12);
}

.clickable-card.is-selected {
  border-color: #ef6a45;
  background: #fffcfb;
  box-shadow: 0 0 0 2px rgba(239, 106, 69, 0.2);
}

.view-chip {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 4px 8px;
  border-radius: 4px;
  background: #f0f4f0;
  color: #3b5049;
  white-space: nowrap;
}

.view-chip.active {
  background: #ef6a45;
  color: #fff;
}

/* Episode Index Section */
.episode-index-section {
  margin-top: 36px;
  border-top: 2px solid #d8e2d7;
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
  color: #17221f;
  margin-bottom: 4px;
}

.index-subtitle {
  color: #60706a;
  font-size: 0.88rem;
}

.program-filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.filter-chip {
  border: 1px solid #c8d6c7;
  background: #fff;
  color: #3d4f48;
  font-family: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.filter-chip:hover {
  border-color: #17221f;
  color: #17221f;
}

.filter-chip.active {
  background: #17221f;
  color: #f6f4ed;
  border-color: #17221f;
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
  background: #fff;
  border: 1px solid #c8d6c7;
  border-radius: 4px;
  padding: 8px 12px;
  font-family: inherit;
  font-size: 0.9rem;
  outline: none;
}

.episode-search-input:focus {
  border-color: #ef6a45;
  box-shadow: 0 0 0 2px rgba(239, 106, 69, 0.15);
}

.index-count-label {
  font-size: 0.85rem;
  color: #60706a;
}

/* Episode List */
.episode-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.episode-card {
  background: #fff;
  border: 1px solid #d8e2d7;
  border-radius: 6px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: box-shadow 0.15s ease;
}

.episode-card:hover {
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.05);
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
  background: #e3ebe2;
  color: #2b4038;
}

.badge.date-tag {
  background: #f4f6f3;
  color: #556660;
}

.badge.track-count-tag {
  background: #fdf2ec;
  color: #bf4926;
}

.ep-title {
  font-size: 1.05rem;
  color: #17221f;
  margin: 0;
  line-height: 1.35;
}

.ep-desc {
  font-size: 0.85rem;
  color: #60706a;
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
  background: #ef6a45;
  color: #fff;
}

.ep-btn-primary:hover {
  background: #d85532;
}

.ep-btn-secondary {
  background: #17221f;
  color: #f6f4ed;
}

.ep-btn-secondary:hover {
  background: #2b3b36;
}

.ep-btn-ghost {
  background: #f0f4f0;
  color: #3b5049;
}

.ep-btn-ghost:hover {
  background: #e0e8e0;
  color: #17221f;
}

.arrow-icon {
  font-size: 0.85rem;
}

/* Inline Tracklist */
.inline-tracklist {
  margin-top: 10px;
  padding: 12px;
  background: #f8faf8;
  border: 1px solid #e1e9e0;
  border-radius: 4px;
}

.tracklist-loading,
.tracklist-empty {
  font-size: 0.85rem;
  color: #6c7c76;
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
  color: #60706a;
  border-bottom: 1px solid #d4dfd3;
  font-weight: 700;
}

.tracklist-table td {
  padding: 6px 8px;
  border-bottom: 1px solid #e9efe8;
  color: #17221f;
}

.track-num {
  font-weight: 700;
  color: #889992;
}

.track-find-link {
  font-size: 0.75rem;
  font-weight: 700;
  color: #ef6a45;
  text-decoration: none;
}

.track-find-link:hover {
  text-decoration: underline;
}

.no-episodes-panel {
  background: #fff;
  border: 1px dashed #c8d6c7;
  padding: 30px;
  text-align: center;
  color: #60706a;
  border-radius: 6px;
}

.reset-filter-btn {
  margin-top: 8px;
  background: #17221f;
  color: #fff;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  font-weight: 700;
  cursor: pointer;
}
</style>
