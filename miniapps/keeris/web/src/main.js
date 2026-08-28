import { createApp, ref, computed, watch } from 'vue';
import './style.css';

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function highlight(text, search) {
  if (!text) return '';
  const escaped = escapeHtml(text);
  if (!search || !search.trim()) return escaped;

  const term = search.trim();
  const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const variant = term.replace(/kandaat/g, 'kantaat').replace(/kantaat/g, 'kandaat');
  const escapedVariant = variant !== term ? '|' + variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
  
  const regex = new RegExp(`(${escapedTerm}${escapedVariant})`, 'gi');
  return escaped.replace(regex, '<mark class="highlight">$1</mark>');
}

const app = {
  setup() {
    const songs = ref([]);
    const query = ref('');
    const loading = ref(true);
    const error = ref('');
    const totalTracks = ref(0);
    const totalUniqueTracks = ref(0);
    const expandedSongs = ref(new Set());

    const toggleExpand = (songId) => {
      const copy = new Set(expandedSongs.value);
      if (copy.has(songId)) copy.delete(songId);
      else copy.add(songId);
      expandedSongs.value = copy;
    };

    const totalMatchingAirings = computed(() => {
      return songs.value.reduce((acc, s) => acc + (s.airings?.length || s.playCount || 1), 0);
    });

    const request = async (query, variables = {}) => {
      const response = await fetch('/graphql', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query, variables }) });
      if (!response.ok) throw new Error(`GraphQL request failed (${response.status})`);
      const payload = await response.json();
      if (payload.errors?.length) throw new Error(payload.errors[0].message);
      return payload.data;
    };

    const search = async (value) => {
      loading.value = true;
      error.value = '';
      try {
        const data = await request(`query($search: String) {
          uniqueTracks(search: $search, limit: 200) {
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
        }`, { search: value });
        songs.value = data.uniqueTracks;
      } catch (reason) {
        error.value = reason.message;
        songs.value = [];
      } finally {
        loading.value = false;
      }
    };

    request('{ stats { tracks uniqueTracks } }')
      .then((data) => {
        totalTracks.value = data.stats.tracks;
        totalUniqueTracks.value = data.stats.uniqueTracks;
        return search('');
      })
      .catch((reason) => { error.value = reason.message; loading.value = false; });
    watch(query, (value) => search(value.trim()), { flush: 'post' });

    return { songs, query, loading, error, totalTracks, totalUniqueTracks, totalMatchingAirings, expandedSongs, toggleExpand, highlight };
  },
  template: `
    <main class="shell">
      <header class="masthead">
        <div class="brand">
          <span class="eyebrow">ERR Radio</span>
          <h1>ERR Archive Index</h1>
        </div>
        <div class="stats-counter" v-if="!query">{{ totalUniqueTracks.toLocaleString() }} unique songs · {{ totalTracks.toLocaleString() }} airings</div>
        <div class="stats-counter" v-else>{{ songs.length.toLocaleString() }} {{ songs.length === 1 ? 'song' : 'unique songs' }} ({{ totalMatchingAirings.toLocaleString() }} total airings)</div>
      </header>

      <section class="search-panel" aria-label="Track search">
        <input id="track-search" v-model="query" type="search" autofocus placeholder="Search unique song title, artist, or show notes (e.g. Remedium, Keeris, Kauamängiv)..." />
      </section>

      <p class="state" v-if="loading">Loading unique songs index...</p>
      <p class="state error" v-else-if="error">{{ error }}</p>
      <p class="state" v-else-if="query && !songs.length">No matching unique songs found.</p>

      <section class="results" v-if="songs.length" aria-live="polite">
        <article class="song-card" :class="{ 'is-episode-match': String(song.id).startsWith('ep-') }" v-for="song in songs" :key="song.id">
          <div class="song-header">
            <div class="song-title-group">
              <span class="play-count-badge episode-badge" v-if="String(song.id).startsWith('ep-')">Episode text match</span>
              <span class="play-count-badge" v-else-if="song.playCount > 1">Played {{ song.playCount }}x</span>
              <span class="play-count-badge single" v-else>Played 1x</span>
              <h2 v-html="highlight(song.title || 'Untitled song', query)"></h2>
              <p class="artist" v-html="highlight(song.artist || 'Unknown artist', query)"></p>
            </div>
          </div>

          <div class="airings-section" v-if="song.airings && song.airings.length">
            <ul class="airings-list">
              <li class="airing-item" v-for="airing in (expandedSongs.has(song.id) ? song.airings : song.airings.slice(0, 1))" :key="airing.id">
                <div class="airing-meta">
                  <span class="program-badge" v-if="airing.programTitle" v-html="highlight(airing.programTitle, query)"></span>
                  <span class="airing-date">{{ airing.date ? airing.date.slice(0, 10) : 'Date unknown' }}</span>
                  <span class="airing-pos" v-if="airing.position">Track {{ airing.position }}</span>
                  <span class="episode-title" v-if="airing.episodeTitle">— <span v-html="highlight(airing.episodeTitle, query)"></span></span>
                </div>
                <p class="episode-desc" v-if="airing.episodeDescription" v-html="highlight(airing.episodeDescription, query)"></p>
                <a :href="airing.episodeUrl" target="_blank" rel="noreferrer" class="open-link">Open episode <span aria-hidden="true">↗</span></a>
              </li>
            </ul>
            <button class="expand-btn" v-if="song.airings.length > 1" @click="toggleExpand(song.id)">
              <span v-if="!expandedSongs.has(song.id)">+ {{ song.airings.length - 1 }} more {{ song.airings.length - 1 === 1 ? 'episode airing' : 'episode airings' }} ↓</span>
              <span v-else>Show fewer ↑</span>
            </button>
          </div>
        </article>
      </section>
    </main>
  `,
};

createApp(app).mount('#app');