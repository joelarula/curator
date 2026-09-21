<template>
  <div>
    <!-- Track Search Input Section -->
    <section class="search-panel" aria-label="Track search">
      <input
        id="track-search"
        type="search"
        v-model="searchQuery"
        autofocus
        placeholder="Search unique song title, artist, or show notes (e.g. Remedium, Keeris, Kauamängiv)..."
        @input="onSearch"
      />
    </section>

    <!-- Collapsible Program Filter Bar -->
    <section class="filter-bar">
      <div class="filter-bar-header" @click="filtersExpanded = !filtersExpanded">
        <div class="filter-header-left">
          <span class="filter-title">Filter by Program</span>
          <span class="filter-status">
            {{ selectedPrograms.length === 0 ? `All ${programs.length} programs shown` : `${selectedPrograms.length} of ${programs.length} programs selected` }}
          </span>
        </div>
        <div class="filter-header-right">
          <button class="collapse-toggle-btn" type="button">
            {{ filtersExpanded ? 'Collapse filters ▲' : 'Expand filters ▼' }}
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
          <span class="chip-count">{{ (prog.episodes || 0).toLocaleString() }} eps · {{ (prog.tracks || 0).toLocaleString() }} tracks</span>
        </label>
      </div>
    </section>
    <!-- Stats Bar -->
    <div class="stats-bar">
      <div v-if="loadError" class="stats-counter" style="color: #c0392b;">⚠ {{ loadError }}</div>
      <div v-else class="stats-counter">
        <template v-if="isSearchActive">
          {{ (displayedStats.uniqueTracks || 0).toLocaleString() }} unique songs · {{ (displayedStats.tracks || 0).toLocaleString() }} airings across {{ (displayedStats.episodes || 0).toLocaleString() }} episodes
          <span class="total-hint">(of {{ (stats.uniqueTracks || 0).toLocaleString() }} songs · {{ (stats.tracks || 0).toLocaleString() }} airings in catalog)</span>
        </template>
        <template v-else>
          {{ (stats.uniqueTracks || 0).toLocaleString() }} unique songs · {{ (stats.tracks || 0).toLocaleString() }} airings across {{ (stats.episodes || 0).toLocaleString() }} episodes
        </template>
      </div>
    </div>

    <!-- Results Section -->
    <div v-if="loading" class="text-center py-8 text-medium-emphasis">
      Loading catalog...
    </div>
    <div v-else-if="songs.length === 0" class="text-center py-8 text-medium-emphasis">
      No matching songs found for "{{ searchQuery }}".
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
            <span class="play-count-badge episode-badge" v-if="String(song.id).startsWith('ep-')">Episode text match</span>
            <span class="play-count-badge" v-else-if="(song.playCount ?? 0) > 1">Played {{ song.playCount }}x</span>
            <span class="play-count-badge single" v-else>Played 1x</span>
            <h2 v-html="highlight(song.title || 'Untitled song', searchQuery)"></h2>
            <p class="artist" v-html="highlight(song.artist || 'Unknown artist', searchQuery)"></p>
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
                <span v-if="airing.programTitle" class="program-badge">{{ airing.programTitle }}</span>
                <span class="airing-date">{{ airing.date ? airing.date.slice(0, 10) : '' }}</span>
                <span v-if="airing.position" class="airing-pos">Track {{ airing.position }}</span>
                <span v-if="airing.episodeTitle" class="episode-title">— <span><span v-html="highlight(airing.episodeTitle, searchQuery)"></span></span></span>
              </div>
              <p v-if="airing.episodeDescription" class="episode-desc" v-html="highlight(airing.episodeDescription, searchQuery)"></p>
              <a :href="airing.episodeUrl ?? undefined" target="_blank" rel="noreferrer" class="open-link">
                Open episode <span aria-hidden="true">↗</span>
              </a>
            </li>
          </ul>
          <button
            v-if="song.airings && song.airings.length > 1"
            class="expand-btn"
            type="button"
            @click="toggleExpand(song.id)"
          >
            <span v-if="!expandedSongs.has(song.id)">+ {{ song.airings.length - 1 }} more episode {{ song.airings.length - 1 === 1 ? 'airing' : 'airings' }} ↓</span>
            <span v-else>Show fewer episode airings ↑</span>
          </button>
        </div>
      </article>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { requestGraphql, onWorkerReady, onDatabaseChange } from '@wasm/graphql-client';
import type { Track } from '@wasm/types';

const route = useRoute();
defineEmits<{
  (e: 'play-track', track: Track | any): void;
}>();

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
          airings {
            id
            position
            date
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
  background-color: #ffe380;
  color: #17221f;
  font-weight: bold;
  padding: 0 2px;
  border-radius: 2px;
}
</style>
