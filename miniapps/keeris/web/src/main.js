import { createApp, ref, watch } from 'vue';
import './style.css';

const app = {
  setup() {
    const tracks = ref([]);
    const query = ref('');
    const loading = ref(true);
    const error = ref('');
    const totalTracks = ref(0);

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
        const data = await request(`query($search: String) { tracks(search: $search, limit: 500) { id position artist title date episodeTitle episodeUrl rawText } }`, { search: value });
        tracks.value = data.tracks;
      } catch (reason) {
        error.value = reason.message;
        tracks.value = [];
      } finally {
        loading.value = false;
      }
    };

    request('{ stats { tracks } }')
      .then((data) => { totalTracks.value = data.stats.tracks; return search(''); })
      .catch((reason) => { error.value = reason.message; loading.value = false; });
    watch(query, (value) => search(value.trim()), { flush: 'post' });

    return { tracks, query, loading, error, totalTracks };
  },
  template: `
    <main class="shell">
      <header class="masthead">
        <p class="eyebrow">Vikerraadio archive</p>
        <h1>Kauamängiv</h1>
        <p class="intro">Search the published music lists and open the episode at ERR.</p>
      </header>

      <section class="search-panel" aria-label="Track search">
        <label for="track-search">Search artist or track</label>
        <input id="track-search" v-model="query" type="search" autofocus placeholder="Try Keeris, title, or artist" />
        <p class="hint" v-if="!query">{{ totalTracks.toLocaleString() }} tracks indexed</p>
        <p class="hint" v-else>{{ tracks.length.toLocaleString() }} matching tracks</p>
      </section>

      <p class="state" v-if="loading">Loading the index...</p>
      <p class="state error" v-else-if="error">{{ error }}</p>
      <p class="state" v-else-if="query && !tracks.length">No matching tracks.</p>
      <p class="state" v-else-if="!query">Enter a search term to begin.</p>

      <section class="results" v-if="tracks.length" aria-live="polite">
        <article class="result" v-for="track in tracks" :key="track.id">
          <div>
            <p class="track-position">Track {{ track.position }}</p>
            <h2>{{ track.title || 'Untitled track' }}</h2>
            <p class="artist">{{ track.artist || 'Unknown artist' }}</p>
          </div>
          <div class="episode">
            <p>{{ track.date || 'Date unknown' }}</p>
            <a :href="track.episodeUrl" target="_blank" rel="noreferrer">Open episode <span aria-hidden="true">↗</span></a>
          </div>
        </article>
      </section>
    </main>
  `,
};

createApp(app).mount('#app');