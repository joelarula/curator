<template>
  <div>
    <!-- Track Search Input Section -->
    <section class="search-panel" aria-label="Track search">
      <input
        id="track-search"
        type="search"
        v-model="searchQuery"
        autofocus
        :placeholder="$t('trackTable.searchPlaceholder')"
        @input="onSearch"
      />
    </section>

    <!-- Collapsible Program Filter Bar -->
    <section class="filter-bar">
      <div class="filter-bar-header" @click="filtersExpanded = !filtersExpanded">
        <div class="filter-header-left">
          <span class="filter-title">{{ $t('trackTable.filterTitle') }}</span>
          <span class="filter-status">
            {{ selectedPrograms.length === 0 ? $t('trackTable.filterAll', { n: programs.length }) : $t('trackTable.filterSelected', { selected: selectedPrograms.length, total: programs.length }) }}
          </span>
        </div>
        <div class="filter-header-right">
          <button class="collapse-toggle-btn" type="button">
            {{ filtersExpanded ? $t('trackTable.collapseFilters') : $t('trackTable.expandFilters') }}
          </button>
        </div>
      </div>
      <div class="checkbox-group" v-show="filtersExpanded">
        <label v-for="prog in programs" :key="prog.programId" class="checkbox-chip">
          <input
            type="checkbox"
            :value="prog.programId"
            v-model="selectedPrograms"
            @change="fetchData"
          />
          <span class="chip-label">{{ prog.programTitle }}</span>
          <span class="chip-count">{{ $t('trackTable.chipCounts', { eps: (prog.episodes || 0).toLocaleString(), tracks: (prog.tracks || 0).toLocaleString() }) }}</span>
        </label>
      </div>
    </section>
    <!-- Stats Bar -->
    <div class="stats-bar">
      <div v-if="loadError" class="stats-counter" style="color: #c0392b;">⚠ {{ loadError }}</div>
      <div v-else class="stats-counter">
        <template v-if="isSearchActive">
          {{ $t('trackTable.statsSearch', { unique: (displayedStats.uniqueTracks || 0).toLocaleString(), airings: (displayedStats.tracks || 0).toLocaleString(), episodes: (displayedStats.episodes || 0).toLocaleString() }) }}
          <span class="total-hint">{{ $t('trackTable.statsSearchHint', { totalUnique: (stats.uniqueTracks || 0).toLocaleString(), totalAirings: (stats.tracks || 0).toLocaleString() }) }}</span>
        </template>
        <template v-else>
          {{ $t('trackTable.statsAll', { unique: (stats.uniqueTracks || 0).toLocaleString(), airings: (stats.tracks || 0).toLocaleString(), episodes: (stats.episodes || 0).toLocaleString() }) }}
        </template>
      </div>
    </div>

    <!-- Results Section -->
    <div v-if="loading" class="text-center py-8 text-medium-emphasis">
      {{ $t('trackTable.loading') }}
    </div>
    <div v-else-if="songs.length === 0" class="text-center py-8 text-medium-emphasis">
      {{ $t('trackTable.noResults', { query: searchQuery }) }}
    </div>
    <section v-else class="results" aria-live="polite">
      <article
        v-for="song in songs"
        :key="song.id"
        class="song-card"
        :class="{ 'is-episode-match': String(song.id).startsWith('ep-') }"
      >
        <div class="song-header">
          <div class="song-title-group">
            <div class="d-flex flex-column flex-sm-row align-start justify-space-between ga-2">
              <div class="song-heading flex-grow-1">
                <h2 v-html="highlight(song.title || $t('trackTable.untitledSong'), searchQuery)"></h2>
                <div class="artist-row d-flex align-center flex-wrap ga-2 mt-1">
                  <span class="artist" v-html="highlight(song.artist || $t('trackTable.unknownArtist'), searchQuery)"></span>
                  <span class="play-count-badge episode-badge" v-if="String(song.id).startsWith('ep-')">{{ $t('trackTable.episodeMatch') }}</span>
                  <router-link
                    v-else-if="(song.playCount ?? 0) > 1 && song.airings?.[0]?.programId"
                    :to="`/program/${song.airings[0].programId}`"
                    class="play-count-badge play-count-link"
                    :title="$t('trackTable.playedBadge', { n: song.playCount })"
                  >
                    {{ $t('trackTable.playedBadge', { n: song.playCount }) }}
                  </router-link>
                  <span class="play-count-badge" v-else-if="(song.playCount ?? 0) > 1">{{ $t('trackTable.playedBadgeNoLink', { n: song.playCount }) }}</span>
                  <span class="play-count-badge single" v-else>{{ $t('trackTable.playedOnce') }}</span>
                </div>
              </div>
              <button
                class="add-playlist-btn flex-shrink-0"
                type="button"
                @click="openAddToPlaylist(song, (song.airings && song.airings[0]) || null)"
                :title="$t('trackTable.addToPlaylist')"
              >
                {{ $t('trackTable.addToPlaylist') }}
              </button>
            </div>
            <div v-if="song.snippet" class="episode-match-snippet">
              <span class="snippet-label">{{ $t('trackTable.matchInNotes') }}</span>
              <span class="snippet-quote" v-html="highlight(song.snippet, searchQuery)"></span>
            </div>
          </div>
        </div>
        <div class="airings-section">
          <ul class="airings-list">
            <li
              v-for="airing in (expandedSongs.has(song.id) ? (song.airings ?? []) : (song.airings ?? []).slice(0, 1))"
              :key="airing.id"
              class="airing-item"
            >
              <div class="airing-meta">
                <router-link
                  v-if="airing.programTitle && airing.programId"
                  :to="`/program/${airing.programId}`"
                  class="program-badge program-badge-link"
                  title="View program broadcast archive"
                >
                  {{ airing.programTitle }}
                </router-link>
                <span v-else-if="airing.programTitle" class="program-badge">{{ airing.programTitle }}</span>
                <span class="airing-date">{{ airing.date ? airing.date.slice(0, 10) : '' }}</span>
                <span v-if="airing.position" class="airing-pos">{{ $t('trackTable.trackPos', { pos: airing.position }) }}</span>
                <router-link
                  v-if="airing.episodeId && airing.episodeTitle"
                  :to="`/episode/${airing.episodeId}`"
                  class="episode-title-link"
                  title="Open dedicated episode page"
                >
                  — <span v-html="highlight(airing.episodeTitle, searchQuery)"></span>
                </router-link>
                <span v-else-if="airing.episodeTitle" class="episode-title">— <span><span v-html="highlight(airing.episodeTitle, searchQuery)"></span></span></span>
              </div>
              <p v-if="airing.episodeDescription" class="episode-desc" v-html="highlight(airing.episodeDescription, searchQuery)"></p>
              <div class="d-flex align-center flex-wrap ga-2 mt-1">
                <a :href="airing.episodeUrl ?? undefined" target="_blank" rel="noreferrer" class="open-link" :title="$t('trackTable.listen')">
                  {{ $t('trackTable.listen') }} <span aria-hidden="true">↗</span>
                </a>
                <router-link
                  v-if="airing.episodeId"
                  :to="`/episode/${airing.episodeId}`"
                  class="open-link"
                  :title="$t('trackTable.episodePage')"
                >
                  {{ $t('trackTable.episodePage') }}
                </router-link>
              </div>
            </li>
          </ul>
          <button
            v-if="song.airings && song.airings.length > 1"
            class="expand-btn"
            type="button"
            @click="toggleExpand(song.id)"
          >
            <span v-if="!expandedSongs.has(song.id)">{{ song.airings.length - 1 === 1 ? $t('trackTable.moreAiring', { n: song.airings.length - 1 }) : $t('trackTable.moreAirings', { n: song.airings.length - 1 }) }}</span>
            <span v-else>{{ $t('trackTable.fewerAirings') }}</span>
          </button>
        </div>
      </article>
    </section>

    <!-- Add to Playlist Dialog -->
    <AddToPlaylistDialog
      v-model="playlistDialogOpen"
      :track="trackForPlaylist"
      @added="onTrackAddedToPlaylist"
    />

    <v-snackbar v-model="snackbarVisible" timeout="3000" color="success" location="bottom right">
      {{ $t('trackTable.addedToPlaylist', { title: lastAddedPlaylistTitle }) }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { requestGraphql, onWorkerReady, onDatabaseChange } from '@wasm/graphql-client';
import type { Track } from '@wasm/types';
import AddToPlaylistDialog from './AddToPlaylistDialog.vue';
import type { PlaylistItem } from '../services/playlistStorage';

const route = useRoute();
const { t } = useI18n();

const playlistDialogOpen = ref(false);
const trackForPlaylist = ref<Partial<PlaylistItem> | null>(null);
const snackbarVisible = ref(false);
const lastAddedPlaylistTitle = ref('');

function openAddToPlaylist(song: SongItem, airing?: AiringItem | null) {
  trackForPlaylist.value = {
    title: song.title || t('trackTable.untitledSong'),
    artist: song.artist || t('trackTable.unknownArtist'),
    uniqueTrackId: typeof song.id === 'number' ? song.id : null,
    trackId: airing ? (typeof airing.id === 'number' ? airing.id : null) : null,
    programTitle: airing?.programTitle || null,
    episodeTitle: airing?.episodeTitle || null,
    episodeUrl: airing?.episodeUrl || null,
    airDate: airing?.date ? airing.date.slice(0, 10) : null,
    position: airing?.position || null,
  };
  playlistDialogOpen.value = true;
}

function onTrackAddedToPlaylist({ playlistTitle }: { playlistTitle: string }) {
  lastAddedPlaylistTitle.value = playlistTitle;
  snackbarVisible.value = true;
}

export interface ProgramBreakdownItem {
  programId: string;
  programTitle: string;
  episodes: number;
  tracks: number;
  uniqueTracks?: number;
}

export interface AiringItem {
  id: string | number;
  position?: number | string | null;
  date?: string | null;
  episodeId?: string | number | null;
  programId?: string | number | null;
  episodeTitle?: string | null;
  episodeUrl?: string | null;
  programTitle?: string | null;
  episodeDescription?: string | null;
}

export interface SongItem {
  id: string | number;
  artist?: string | null;
  title?: string | null;
  playCount?: number;
  firstPlayedAt?: string | null;
  lastPlayedAt?: string | null;
  airings?: AiringItem[];
}

export interface CatalogStats {
  episodes: number;
  tracks: number;
  uniqueTracks: number;
  programs?: number;
  programBreakdown?: ProgramBreakdownItem[];
}

const searchQuery = ref('');
const songs = ref<SongItem[]>([]);
const stats = ref<CatalogStats>({ episodes: 0, tracks: 0, uniqueTracks: 0 });
const searchStats = ref<CatalogStats | null>(null);
const programs = ref<ProgramBreakdownItem[]>([]);
const selectedPrograms = ref<string[]>([]);
const filtersExpanded = ref(false);
const loading = ref(false);
const loadError = ref<string | null>(null);
const expandedSongs = ref<Set<string | number>>(new Set());
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let liveRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let unsubDbChange: (() => void) | null = null;

const isSearchActive = computed(() => {
  return Boolean(searchQuery.value && searchQuery.value.trim()) || selectedPrograms.value.length > 0;
});

const displayedStats = computed(() => {
  if (!isSearchActive.value) {
    return stats.value;
  }
  if (searchStats.value) {
    return searchStats.value;
  }
  // Reactive client-side fallback
  const uniqueSongs = songs.value.filter(s => !String(s.id).startsWith('ep-')).length;
  const epMatches = songs.value.filter(s => String(s.id).startsWith('ep-')).length;
  const totalAirings = songs.value.reduce((acc, s) => acc + (s.airings?.length || s.playCount || 1), 0);
  const eps = new Set<string>();
  for (const s of songs.value) {
    for (const a of s.airings || []) {
      const ep = a.episodeUrl || a.episodeTitle;
      if (ep) eps.add(ep);
    }
  }
  return {
    uniqueTracks: uniqueSongs,
    tracks: totalAirings,
    episodes: epMatches > 0 ? (eps.size + epMatches) : eps.size,
  };
});

function toggleExpand(songId: string | number) {
  const copy = new Set(expandedSongs.value);
  if (copy.has(songId)) copy.delete(songId);
  else copy.add(songId);
  expandedSongs.value = copy;
}

function escapeHtml(str: any) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function makeDiacriticPattern(str: string): string {
  const diacritics: Record<string, string> = {
    a: '[aàáâãäåāăą]',
    c: '[cçćĉċč]',
    d: '[dďđ]',
    e: '[eèéêëēĕėęě]',
    g: '[gĝğġģ]',
    h: '[hĥħ]',
    i: '[iìíîïĩīĭįı]',
    j: '[jĵ]',
    k: '[kķ]',
    l: '[lĺļľŀł]',
    n: '[nñńņňŉŋ]',
    o: '[oòóôõöøōŏő]',
    r: '[rŕŗř]',
    s: '[sśŝşš]',
    t: '[tţťŧ]',
    u: '[uùúûüũūŭůűų]',
    z: '[zźżž]',
  };
  const normalized = str.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
  return normalized
    .split('')
    .map((ch) => diacritics[ch] || ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('');
}

function highlight(text?: string | null, search?: string | null): string {
  if (!text) return '';
  const escaped = escapeHtml(text);
  if (!search || !search.trim()) return escaped;
  const pattern = makeDiacriticPattern(search.trim());
  if (!pattern) return escaped;
  const regex = new RegExp(`(${pattern})`, 'giu');
  return escaped.replace(regex, '<mark class="highlight">$1</mark>');
}

async function fetchInitialStats() {
  try {
    const data = await requestGraphql(`
      query GetStats {
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
      stats.value = data.stats;
      loadError.value = null;
      if (data.stats.programBreakdown) {
        programs.value = data.stats.programBreakdown;
      }
    }
  } catch (err: any) {
    console.error('[TrackTable] Failed to fetch stats:', err);
    loadError.value = 'Failed to load catalog stats: ' + (err?.message || String(err));
  }
}

async function fetchData() {
  // Only show the "Loading catalog..." spinner on the true initial load; typeahead
  // search/filter refetches update the results in place without flashing it.
  if (songs.value.length === 0) loading.value = true;
  try {
    const isFiltered = Boolean(searchQuery.value && searchQuery.value.trim()) || selectedPrograms.value.length > 0;
    const data = await requestGraphql(`
      query GetUniqueTracks($search: String, $programIds: [ID]) {
        stats(search: $search, programIds: $programIds) {
          episodes
          tracks
          uniqueTracks
          programs
        }
        uniqueTracks(search: $search, programIds: $programIds, limit: 100) {
          id
          artist
          title
          playCount
          firstPlayedAt
          lastPlayedAt
          snippet
          airings {
            id
            position
            date
            episodeId
            programId
            episodeTitle
            episodeUrl
            programTitle
            episodeDescription
          }
        }
      }
    `, {
      search: searchQuery.value || null,
      programIds: selectedPrograms.value.length > 0 ? selectedPrograms.value : null
    });

    songs.value = data.uniqueTracks || [];
    if (data.stats) {
      if (isFiltered) {
        searchStats.value = data.stats;
      } else {
        searchStats.value = null;
        stats.value = data.stats;
      }
    }
  } catch (err) {
    console.error('[TrackTable] Failed to fetch tracks:', err);
  } finally {
    loading.value = false;
  }
}

function onSearch() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    fetchData();
  }, 180);
}

function parseProgramIds(param: unknown): string[] {
  if (!param) return [];
  if (Array.isArray(param)) {
    return param.filter((p): p is string => typeof p === 'string');
  }
  return [String(param)];
}

watch(() => route.query, (q) => {
  if (q.search !== undefined) searchQuery.value = q.search ? String(q.search) : '';
  if (q.programId !== undefined) {
    selectedPrograms.value = parseProgramIds(q.programId);
  }
  fetchData();
});

onMounted(() => {
  if (route.query.search) {
    searchQuery.value = String(route.query.search);
  }
  if (route.query.programId) {
    selectedPrograms.value = parseProgramIds(route.query.programId);
  }

  onWorkerReady(() => {
    fetchInitialStats();
    fetchData();
  });

  unsubDbChange = onDatabaseChange(() => {
    if (liveRefreshTimer) clearTimeout(liveRefreshTimer);
    liveRefreshTimer = setTimeout(() => {
      fetchInitialStats();
      fetchData();
    }, 400);
  });
});

onUnmounted(() => {
  if (unsubDbChange) unsubDbChange();
  if (liveRefreshTimer) clearTimeout(liveRefreshTimer);
  if (debounceTimer) clearTimeout(debounceTimer);
});
</script>

<style scoped>
:deep(mark.highlight) {
  background-color: var(--highlight-bg);
  color: var(--highlight-text);
  font-weight: 600;
  padding: 0 3px;
  border-radius: 2px;
}

.is-episode-match {
  background: var(--bg-surface);
}

.episode-badge {
  background: var(--stats-bg) !important;
  color: var(--accent) !important;
  border: 1px solid var(--border-default) !important;
  font-weight: 600;
}

.episode-match-snippet {
  margin: 8px 0 4px;
  padding: 8px 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  font-size: 0.88rem;
  color: var(--text-secondary);
  line-height: 1.45;
}

.snippet-label {
  display: block;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #0284c7;
  margin-bottom: 2px;
}

.snippet-quote {
  font-style: italic;
  color: #334155;
}

.add-playlist-btn {
  background: transparent;
  border: 1px solid #10b981;
  color: #047857;
  font-size: 0.78rem;
  font-weight: 600;
  padding: 6px 12px;
  min-height: 32px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.add-playlist-btn:hover {
  background: #10b981;
  color: #ffffff;
}

.play-count-link {
  text-decoration: none;
  cursor: pointer;
  transition: all 0.15s ease;
}
.play-count-link:hover {
  background: rgba(23, 34, 31, 0.16);
  color: #17221f;
  border-color: rgba(23, 34, 31, 0.3);
}

.program-badge-link {
  text-decoration: none;
  transition: opacity 0.15s ease;
}
.program-badge-link:hover {
  opacity: 0.85;
}

.episode-title-link {
  color: inherit;
  text-decoration: none;
  transition: color 0.15s ease;
}
.episode-title-link:hover {
  color: #0284c7;
  text-decoration: underline;
}
</style>
