<template>
  <div class="program-detail-page mt-4">
    <!-- Back to Programs Link -->
    <div class="mb-3">
      <router-link to="/summary" class="back-link">
        <v-icon icon="mdi-arrow-left" size="small" class="mr-1" />
        {{ $t('programDetail.backToSummary') }}
      </router-link>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="text-center py-12 text-medium-emphasis">
      {{ $t('programDetail.loadingProgram') }}
    </div>

    <!-- Error / Not Found -->
    <div v-else-if="!program" class="text-center py-12 text-medium-emphasis">
      <h3>{{ $t('programDetail.programNotFound') }}</h3>
      <p class="text-caption mt-1">{{ $t('programDetail.programNotFoundDesc', { id: programId }) }}</p>
      <v-btn color="primary" variant="tonal" size="small" to="/summary" class="mt-4">
        {{ $t('programDetail.returnToSummary') }}
      </v-btn>
    </div>

    <!-- Program Content -->
    <div v-else>
      <!-- Program Header Card -->
      <v-card color="surface" variant="outlined" class="pa-5 rounded-lg mb-5">
        <div class="d-flex align-start justify-space-between flex-wrap ga-3">
          <div>
            <div class="d-flex align-center ga-2 mb-1">
              <span class="program-badge">{{ program.seriesId || 'ERR Program' }}</span>
              <span class="text-caption text-medium-emphasis">ID: {{ program.id }}</span>
            </div>
            <h1 class="text-h5 text-sm-h4 font-weight-bold mb-2">{{ program.title }}</h1>
            <p v-if="program.description" class="text-body-1 text-medium-emphasis mb-3 max-w-2xl">
              {{ program.description }}
            </p>
          </div>

          <div class="d-flex align-center flex-wrap ga-2 w-100 w-sm-auto">
            <a
              v-if="program.url"
              :href="program.url"
              target="_blank"
              rel="noreferrer"
              class="ep-action-btn ghost-btn flex-grow-1 flex-sm-grow-0"
            >
              <span>{{ $t('programDetail.errArchivePage') }}</span>
              <v-icon icon="mdi-open-in-new" size="x-small" class="ml-1" />
            </a>

            <router-link
              :to="{ path: '/', query: { programId: String(program.id) } }"
              class="ep-action-btn primary-btn flex-grow-1 flex-sm-grow-0"
            >
              <span>{{ $t('programDetail.exploreSongs') }}</span>
            </router-link>
          </div>
        </div>

        <!-- Metrics Row -->
        <div class="metrics-strip d-flex align-center flex-wrap ga-4 pt-4 mt-4 border-t">
          <div class="metric-item">
            <span class="metric-val">{{ episodes.length }}</span>
            <span class="metric-label">{{ $t('programDetail.metricEpisodes') }}</span>
          </div>
          <div class="metric-item">
            <span class="metric-val">{{ totalTracks }}</span>
            <span class="metric-label">{{ $t('programDetail.metricTracks') }}</span>
          </div>
          <div class="metric-item">
            <span class="metric-val">{{ (progStat?.uniqueTracks || 0).toLocaleString() }}</span>
            <span class="metric-label">{{ $t('programDetail.metricUnique') }}</span>
          </div>
        </div>
      </v-card>

      <!-- Broadcast Episodes Section -->
      <section class="episodes-section">
        <div class="d-flex align-center justify-space-between flex-wrap ga-3 mb-4">
          <div>
            <h2 class="text-h6 font-weight-bold mb-0">{{ $t('programDetail.broadcastEpisodes', { n: filteredEpisodes.length }) }}</h2>
          </div>

          <v-text-field
            v-model="searchQuery"
            density="compact"
            variant="outlined"
            :placeholder="$t('programDetail.searchEpisodesPlaceholder')"
            prepend-inner-icon="mdi-magnify"
            hide-details
            clearable
            class="w-100 w-sm-auto"
            style="max-width: 320px;"
          />
        </div>

        <!-- Episodes List -->
        <div v-if="filteredEpisodes.length === 0" class="text-center py-8 text-medium-emphasis">
          {{ $t('programDetail.noEpisodesFound', { query: searchQuery }) }}
        </div>

        <div v-else class="episode-cards">
          <v-card
            v-for="ep in filteredEpisodes"
            :key="ep.id"
            color="surface"
            variant="outlined"
            class="pa-4 mb-3 rounded-lg episode-card-item"
          >
            <div class="d-flex align-start justify-space-between flex-wrap ga-2">
              <div class="flex-grow-1 min-w-0">
                <div class="d-flex align-center flex-wrap ga-2 mb-1">
                  <span class="date-badge">📅 {{ formatDate(ep.scheduledAt || ep.publishedAt) }}</span>
                  <span class="track-badge">🎵 {{ $t('programDetail.tracksCount', { n: ep.trackCount || 0 }) }}</span>
                </div>
                <h3 class="text-subtitle-1 font-weight-bold mb-1">
                  <router-link :to="`/episode/${ep.id}`" class="episode-title-link">
                    {{ ep.title }}
                  </router-link>
                </h3>
                <p v-if="ep.metadata?.summary || ep.metadata?.description" class="text-body-2 text-medium-emphasis mb-2">
                  {{ ep.metadata?.summary || ep.metadata?.description }}
                </p>
              </div>

              <!-- Episode Action Buttons -->
              <div class="d-flex align-center flex-wrap ga-2 w-100 w-sm-auto">
                <a
                  v-if="ep.url"
                  :href="ep.url"
                  target="_blank"
                  rel="noreferrer"
                  class="ep-action-btn primary-btn flex-grow-1 flex-sm-grow-0"
                  :title="$t('programDetail.listenOnErr')"
                >
                  <span>{{ $t('programDetail.listenOnErr') }}</span>
                  <v-icon icon="mdi-open-in-new" size="x-small" class="ml-1" />
                </a>

                <router-link
                  :to="`/episode/${ep.id}`"
                  class="ep-action-btn secondary-btn flex-grow-1 flex-sm-grow-0"
                >
                  <span>{{ $t('programDetail.episodePage') }}</span>
                </router-link>

                <button
                  type="button"
                  class="ep-action-btn ghost-btn flex-grow-1 flex-sm-grow-0"
                  @click="toggleTracklist(ep.id)"
                >
                  {{ expandedEpId === ep.id ? $t('programDetail.hideTracks') : $t('programDetail.showTracks') }}
                </button>
              </div>
            </div>

            <!-- Inline Tracklist -->
            <div v-if="expandedEpId === ep.id" class="inline-tracklist mt-3 pt-3 border-t">
              <div v-if="tracksLoading" class="text-caption text-medium-emphasis py-2">
                {{ $t('programDetail.loadingTracklist') }}
              </div>
              <div v-else-if="currentTracks.length === 0" class="text-caption text-medium-emphasis py-2">
                {{ $t('programDetail.noTracksIndexed') }}
              </div>
              <div v-else class="tracklist-table-container">
                <table class="tracklist-table">
                  <thead>
                    <tr>
                      <th style="width: 40px;">#</th>
                      <th>{{ $t('programDetail.thArtist') }}</th>
                      <th>{{ $t('programDetail.thTitle') }}</th>
                      <th style="width: 100px;">{{ $t('programDetail.thActions') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="t in currentTracks" :key="t.id">
                      <td class="text-caption font-weight-bold">#{{ t.position }}</td>
                      <td><strong>{{ t.artist || '—' }}</strong></td>
                      <td>{{ t.title || t.rawText }}</td>
                      <td>
                        <button
                          class="tiny-playlist-btn"
                          type="button"
                          @click="openAddToPlaylist(t, ep)"
                          :title="$t('programDetail.addToPlaylist')"
                        >
                          {{ $t('programDetail.addToPlaylist') }}
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </v-card>
        </div>
      </section>
    </div>

    <!-- Add To Playlist Dialog -->
    <AddToPlaylistDialog
      v-model="playlistDialogOpen"
      :track="trackForPlaylist"
      @added="onTrackAddedToPlaylist"
    />

    <v-snackbar v-model="snackbarVisible" timeout="3000" color="success" location="bottom right">
      {{ $t('programDetail.addedToPlaylist', { title: lastAddedPlaylistTitle }) }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { requestGraphql, onWorkerReady } from '@wasm/graphql-client';
import AddToPlaylistDialog from './AddToPlaylistDialog.vue';
import type { PlaylistItem } from '../services/playlistStorage';

const route = useRoute();
const { t } = useI18n();
const programId = computed(() => String(route.params.id || ''));

const loading = ref(true);
const program = ref<any>(null);
const progStat = ref<any>(null);
const episodes = ref<any[]>([]);
const searchQuery = ref('');

const expandedEpId = ref<string | null>(null);
const currentTracks = ref<any[]>([]);
const tracksLoading = ref(false);

const playlistDialogOpen = ref(false);
const trackForPlaylist = ref<Partial<PlaylistItem> | null>(null);
const snackbarVisible = ref(false);
const lastAddedPlaylistTitle = ref('');

const totalTracks = computed(() => {
  return episodes.value.reduce((acc, ep) => acc + (ep.trackCount || 0), 0);
});

const filteredEpisodes = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return episodes.value;
  return episodes.value.filter((ep) => {
    return (
      (ep.title && ep.title.toLowerCase().includes(q)) ||
      (ep.scheduledAt && ep.scheduledAt.includes(q)) ||
      (ep.metadata?.description && ep.metadata.description.toLowerCase().includes(q)) ||
      (ep.metadata?.summary && ep.metadata.summary.toLowerCase().includes(q))
    );
  });
});

function formatDate(isoStr?: string | null): string {
  if (!isoStr) return 'N/A';
  return isoStr.slice(0, 10);
}

async function fetchProgramData() {
  if (!programId.value) return;
  loading.value = true;
  try {
    // 1. Fetch Program and Episodes
    const data = await requestGraphql(`
      query GetProgramDetails($id: ID!) {
        program(id: $id) {
          id
          seriesId
          title
          slug
          description
          url
        }
        episodes(programId: $id, limit: 300) {
          id
          url
          title
          scheduledAt
          publishedAt
          parseStatus
          trackCount
          metadata {
            summary
            description
          }
        }
        stats(programIds: [$id]) {
          episodes
          tracks
          uniqueTracks
          programBreakdown {
            programId
            programTitle
            episodes
            tracks
            uniqueTracks
          }
        }
      }
    `, { id: programId.value });

    program.value = data?.program || null;
    episodes.value = data?.episodes || [];
    if (data?.stats) {
      if (data.stats.programBreakdown && data.stats.programBreakdown.length > 0) {
        progStat.value = data.stats.programBreakdown[0];
      } else {
        progStat.value = {
          programId: programId.value,
          programTitle: data.program?.title || '',
          episodes: data.stats.episodes || 0,
          tracks: data.stats.tracks || 0,
          uniqueTracks: data.stats.uniqueTracks || 0,
        };
      }
    }
  } catch (err) {
    console.error('[ProgramDetail] Failed to fetch program data:', err);
  } finally {
    loading.value = false;
  }
}

async function toggleTracklist(epId: string) {
  if (expandedEpId.value === epId) {
    expandedEpId.value = null;
    return;
  }
  expandedEpId.value = epId;
  tracksLoading.value = true;
  currentTracks.value = [];
  try {
    const data = await requestGraphql(`
      query GetEpTracks($episodeId: ID) {
        tracks(episodeId: $episodeId, limit: 100) {
          id
          position
          artist
          title
          rawText
        }
      }
    `, { episodeId: epId });
    currentTracks.value = data.tracks || [];
  } catch (err) {
    console.error('[ProgramDetail] Failed to fetch tracks:', err);
  } finally {
    tracksLoading.value = false;
  }
}

function openAddToPlaylist(track: any, ep: any) {
  trackForPlaylist.value = {
    title: track.title || track.rawText || 'Untitled Track',
    artist: track.artist || null,
    trackId: typeof track.id === 'number' ? track.id : null,
    programTitle: program.value?.title || null,
    episodeTitle: ep.title || null,
    episodeUrl: ep.url || null,
    airDate: ep.scheduledAt ? ep.scheduledAt.slice(0, 10) : null,
    position: track.position || null,
  };
  playlistDialogOpen.value = true;
}

function onTrackAddedToPlaylist({ playlistTitle }: { playlistTitle: string }) {
  lastAddedPlaylistTitle.value = playlistTitle;
  snackbarVisible.value = true;
}

watch(programId, () => {
  fetchProgramData();
});

onMounted(() => {
  onWorkerReady(() => {
    fetchProgramData();
  });
});
</script>

<style scoped>
.program-detail-page {
  max-width: 1200px;
  margin: 0 auto;
}

.back-link {
  color: var(--accent);
  text-decoration: none;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  font-size: 0.9rem;
}

.back-link:hover {
  text-decoration: underline;
  color: var(--accent-hover);
}

.program-badge {
  background: var(--stats-bg);
  color: var(--text-primary);
  font-size: 0.75rem;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 4px;
  border: 1px solid var(--border-default);
}

.metrics-strip {
  gap: 2rem;
  border-top: 1px solid var(--border-subtle);
}

.metric-item {
  display: flex;
  flex-direction: column;
}

.metric-val {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--accent);
  line-height: 1.2;
}

.metric-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

.date-badge {
  font-size: 0.72rem;
  background: var(--bg-surface);
  color: var(--text-secondary);
  border: 1px solid var(--border-default);
  padding: 2px 6px;
  border-radius: 4px;
}

.track-badge {
  font-size: 0.72rem;
  background: var(--stats-bg);
  color: var(--accent);
  border: 1px solid var(--border-default);
  padding: 2px 6px;
  border-radius: 4px;
}

.episode-title-link {
  color: var(--text-primary);
  text-decoration: none;
  transition: color 0.15s ease;
}

.episode-title-link:hover {
  color: var(--accent);
  text-decoration: underline;
}

.ep-action-btn {
  font-size: 0.78rem;
  font-weight: 600;
  padding: 5px 12px;
  border-radius: 4px;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.primary-btn {
  background: var(--accent);
  color: #fff;
  border: none;
}
.primary-btn:hover {
  background: var(--accent-hover);
}

.secondary-btn {
  background: var(--nav-active-bg);
  color: var(--nav-active-text);
  border: 1px solid var(--border-default);
}
.secondary-btn:hover {
  background: var(--accent);
  color: #fff;
}

.ghost-btn {
  background: var(--stats-bg);
  color: var(--text-primary);
  border: 1px solid var(--border-default);
}
.ghost-btn:hover {
  color: var(--accent);
  border-color: var(--accent);
}

.tracklist-table-container {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.tracklist-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.tracklist-table th {
  text-align: left;
  padding: 6px 10px;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border-default);
  font-weight: 700;
}

.tracklist-table td {
  padding: 6px 10px;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-primary);
}

.tiny-playlist-btn {
  background: transparent;
  border: 1px solid var(--accent);
  color: var(--accent);
  font-size: 0.75rem;
  font-weight: 600;
  padding: 4px 10px;
  min-height: 28px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.tiny-playlist-btn:hover {
  background: var(--accent);
  color: #fff;
}

.max-w-2xl {
  max-width: 680px;
}
</style>
