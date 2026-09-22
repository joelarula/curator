<template>
  <div class="episode-detail-page mt-4">
    <!-- Back Link -->
    <div class="mb-3 d-flex align-center ga-2">
      <router-link
        v-if="episode && episode.program"
        :to="`/program/${episode.program.id}`"
        class="back-link"
      >
        <v-icon icon="mdi-arrow-left" size="small" class="mr-1" />
        Back to {{ episode.program.title }}
      </router-link>
      <router-link v-else to="/summary" class="back-link">
        <v-icon icon="mdi-arrow-left" size="small" class="mr-1" />
        Back to Programs
      </router-link>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="text-center py-12 text-medium-emphasis">
      Loading episode details...
    </div>

    <!-- Error / Not Found -->
    <div v-else-if="!episode" class="text-center py-12 text-medium-emphasis">
      <h3>Episode not found</h3>
      <p class="text-caption mt-1">Unable to find episode with ID "{{ episodeId }}".</p>
      <v-btn color="primary" variant="tonal" size="small" to="/summary" class="mt-4">
        Return to Summary
      </v-btn>
    </div>

    <!-- Episode Details Content -->
    <div v-else>
      <v-card color="surface" variant="outlined" class="pa-5 rounded-lg mb-5">
        <div class="d-flex align-start justify-space-between flex-wrap ga-3">
          <div>
            <div class="d-flex align-center flex-wrap ga-2 mb-2">
              <router-link
                v-if="episode.program"
                :to="`/program/${episode.program.id}`"
                class="program-tag-link"
                title="View program details"
              >
                {{ episode.program.title }}
              </router-link>
              <span class="date-tag">📅 {{ formatDate(episode.scheduledAt || episode.publishedAt) }}</span>
              <span class="tracks-count-tag">🎵 {{ tracks.length }} tracks indexed</span>
            </div>

            <h1 class="text-h4 font-weight-bold mb-2">{{ episode.title }}</h1>

            <p v-if="episode.metadata?.summary || episode.metadata?.description" class="text-body-1 text-medium-emphasis mb-3 max-w-2xl">
              {{ episode.metadata?.summary || episode.metadata?.description }}
            </p>
          </div>

          <!-- Actions -->
          <div class="d-flex align-center flex-wrap ga-2">
            <a
              v-if="episode.url"
              :href="episode.url"
              target="_blank"
              rel="noreferrer"
              class="v-btn v-btn--density-default v-btn--size-small v-btn--variant-flat bg-secondary text-white"
            >
              <span>Listen on ERR Archive</span>
              <v-icon icon="mdi-open-in-new" size="x-small" class="ml-1" />
            </a>

            <router-link
              :to="{ path: '/', query: { search: episode.title } }"
              class="v-btn v-btn--density-default v-btn--size-small v-btn--variant-outlined"
            >
              <span>Search in Catalog</span>
            </router-link>
          </div>
        </div>

        <!-- Full Notes / Text if present -->
        <div v-if="episode.metadata?.fullText" class="mt-4 pt-4 border-t">
          <h4 class="text-subtitle-2 font-weight-bold text-medium-emphasis mb-1">Broadcast Notes:</h4>
          <p class="text-body-2 text-medium-emphasis whitespace-pre-wrap">
            {{ episode.metadata.fullText }}
          </p>
        </div>
      </v-card>

      <!-- Episode Tracklist Section -->
      <v-card color="surface" variant="outlined" class="pa-4 rounded-lg">
        <v-card-title class="d-flex align-center justify-space-between pb-3">
          <div class="d-flex align-center ga-2">
            <v-icon icon="mdi-music" color="primary" />
            <span class="text-h6 font-weight-bold">Episode Tracklist ({{ tracks.length }})</span>
          </div>
        </v-card-title>

        <v-card-text class="px-0">
          <div v-if="tracksLoading" class="text-center py-6 text-medium-emphasis">
            Loading tracks...
          </div>
          <div v-else-if="tracks.length === 0" class="text-center py-6 text-medium-emphasis">
            No tracklist entries indexed for this broadcast.
          </div>
          <div v-else class="tracklist-table-container">
            <table class="episode-tracks-table">
              <thead>
                <tr>
                  <th style="width: 50px;">#</th>
                  <th>Artist / Performer</th>
                  <th>Track Title</th>
                  <th style="width: 170px;">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="t in tracks" :key="t.id" class="track-row">
                  <td class="track-pos-col">#{{ t.position }}</td>
                  <td class="track-artist-col"><strong>{{ t.artist || '—' }}</strong></td>
                  <td class="track-title-col">{{ t.title || t.rawText }}</td>
                  <td>
                    <div class="d-flex align-center ga-2">
                      <button
                        class="track-playlist-btn"
                        type="button"
                        @click="openAddToPlaylist(t)"
                        title="Add to playlist"
                      >
                        + Playlist
                      </button>
                      <router-link
                        :to="{ path: '/', query: { search: t.title || t.artist || '' } }"
                        class="track-search-btn"
                        title="Search all airings in catalog"
                      >
                        Search
                      </router-link>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </v-card-text>
      </v-card>
    </div>

    <!-- Add To Playlist Dialog -->
    <AddToPlaylistDialog
      v-model="playlistDialogOpen"
      :track="trackForPlaylist"
      @added="onTrackAddedToPlaylist"
    />

    <v-snackbar v-model="snackbarVisible" timeout="3000" color="success" location="bottom right">
      Added to "{{ lastAddedPlaylistTitle }}"!
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { requestGraphql, onWorkerReady } from '@wasm/graphql-client';
import AddToPlaylistDialog from './AddToPlaylistDialog.vue';
import type { PlaylistItem } from '../services/playlistStorage';

const route = useRoute();
const episodeId = computed(() => String(route.params.id || ''));

const loading = ref(true);
const episode = ref<any>(null);
const tracks = ref<any[]>([]);
const tracksLoading = ref(false);

const playlistDialogOpen = ref(false);
const trackForPlaylist = ref<Partial<PlaylistItem> | null>(null);
const snackbarVisible = ref(false);
const lastAddedPlaylistTitle = ref('');

function formatDate(isoStr?: string | null): string {
  if (!isoStr) return 'N/A';
  return isoStr.slice(0, 10);
}

async function fetchEpisodeData() {
  if (!episodeId.value) return;
  loading.value = true;
  tracksLoading.value = true;
  try {
    const data = await requestGraphql(`
      query GetEpisodeDetail($id: ID!) {
        episode(id: $id) {
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
            seriesId
          }
          metadata {
            summary
            description
            fullText
          }
        }
        tracks(episodeId: $id, limit: 200) {
          id
          position
          artist
          title
          rawText
        }
      }
    `, { id: episodeId.value });

    episode.value = data.episode || null;
    tracks.value = data.tracks || [];
  } catch (err) {
    console.error('[EpisodeDetail] Failed to fetch episode details:', err);
  } finally {
    loading.value = false;
    tracksLoading.value = false;
  }
}

function openAddToPlaylist(track: any) {
  trackForPlaylist.value = {
    title: track.title || track.rawText || 'Untitled Track',
    artist: track.artist || null,
    trackId: typeof track.id === 'number' ? track.id : null,
    programTitle: episode.value?.program?.title || null,
    episodeTitle: episode.value?.title || null,
    episodeUrl: episode.value?.url || null,
    airDate: episode.value?.scheduledAt ? episode.value.scheduledAt.slice(0, 10) : null,
    position: track.position || null,
  };
  playlistDialogOpen.value = true;
}

function onTrackAddedToPlaylist({ playlistTitle }: { playlistTitle: string }) {
  lastAddedPlaylistTitle.value = playlistTitle;
  snackbarVisible.value = true;
}

watch(episodeId, () => {
  fetchEpisodeData();
});

onMounted(() => {
  onWorkerReady(() => {
    fetchEpisodeData();
  });
});
</script>

<style scoped>
.episode-detail-page {
  max-width: 1200px;
  margin: 0 auto;
}

.back-link {
  color: #10b981;
  text-decoration: none;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  font-size: 0.9rem;
}

.back-link:hover {
  text-decoration: underline;
}

.program-tag-link {
  background: #17221f;
  color: #10b981;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 4px;
  border: 1px solid rgba(16, 185, 129, 0.3);
  text-decoration: none;
  display: inline-block;
}

.program-tag-link:hover {
  background: rgba(16, 185, 129, 0.2);
}

.date-tag {
  font-size: 0.72rem;
  background: rgba(255, 255, 255, 0.08);
  padding: 3px 8px;
  border-radius: 4px;
}

.tracks-count-tag {
  font-size: 0.72rem;
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
  padding: 3px 8px;
  border-radius: 4px;
}

.episode-tracks-table {
  width: 100%;
  border-collapse: collapse;
}

.episode-tracks-table th {
  padding: 8px 12px;
  border-bottom: 2px solid rgba(255, 255, 255, 0.1);
  text-align: left;
  font-size: 0.8rem;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.6);
}

.episode-tracks-table td {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 0.9rem;
}

.track-row:hover {
  background: rgba(255, 255, 255, 0.03);
}

.track-pos-col {
  font-weight: 700;
  color: #10b981;
}

.track-playlist-btn {
  background: transparent;
  border: 1px solid #10b981;
  color: #10b981;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.track-playlist-btn:hover {
  background: #10b981;
  color: #fff;
}

.track-search-btn {
  color: #94a3b8;
  font-size: 0.72rem;
  text-decoration: none;
}

.track-search-btn:hover {
  color: #38bdf8;
  text-decoration: underline;
}

.whitespace-pre-wrap {
  white-space: pre-wrap;
  line-height: 1.5;
}

.max-w-2xl {
  max-width: 720px;
}
</style>
