<template>
  <v-card color="surface" variant="outlined" class="pa-4 rounded-lg mt-4">
    <v-card-title class="d-flex align-center justify-space-between pb-2">
      <div class="d-flex align-center">
        <v-icon icon="mdi-playlist-music" color="secondary" class="mr-2" />
        <span class="text-h6 font-weight-bold">OPFS Playlists</span>
      </div>

      <v-btn
        color="secondary"
        variant="tonal"
        size="small"
        prepend-icon="mdi-plus"
        @click="showCreateDialog = true"
      >
        New Playlist
      </v-btn>
    </v-card-title>

    <v-card-text>
      <v-row v-if="playlists.length === 0">
        <v-col cols="12" class="text-center text-medium-emphasis py-4">
          No playlists created yet in OPFS SQLite database. Click "New Playlist" to create one.
        </v-col>
      </v-row>

      <v-row v-else>
        <v-col v-for="pl in playlists" :key="pl.id" cols="12" md="6">
          <v-card variant="tonal" color="surface-variant" class="pa-3">
            <div class="d-flex align-center justify-space-between">
              <div>
                <div class="font-weight-bold text-subtitle-1">{{ pl.title }}</div>
                <div class="text-caption text-medium-emphasis">{{ pl.description || 'No description' }}</div>
              </div>
              <v-chip size="small" color="primary" variant="flat">
                {{ pl.itemCount }} tracks
              </v-chip>
            </div>
          </v-card>
        </v-col>
      </v-row>
    </v-card-text>

    <!-- Create Dialog -->
    <v-dialog v-model="showCreateDialog" max-width="450">
      <v-card color="surface">
        <v-card-title class="font-weight-bold">Create New Playlist</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="newTitle"
            label="Playlist Title"
            variant="outlined"
            density="compact"
            class="mb-3"
          />
          <v-textarea
            v-model="newDescription"
            label="Description"
            variant="outlined"
            density="compact"
            rows="2"
          />
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="showCreateDialog = false">Cancel</v-btn>
          <v-btn color="primary" variant="flat" :disabled="!newTitle" @click="createPlaylist">Create</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { requestGraphql, onWorkerReady } from '@wasm/graphql-client.js';

const playlists = ref([]);
const showCreateDialog = ref(false);
const newTitle = ref('');
const newDescription = ref('');

async function fetchPlaylists() {
  try {
    const data = await requestGraphql(`
      query GetPlaylists {
        playlists {
          id
          title
          description
          itemCount
          createdAt
        }
      }
    `);
    playlists.value = data.playlists || [];
  } catch (err) {
    console.error('[PlaylistManager] Failed to fetch playlists:', err);
  }
}

async function createPlaylist() {
  if (!newTitle.value) return;
  try {
    await requestGraphql(`
      mutation CreatePlaylist($title: String!, $description: String) {
        createPlaylist(title: $title, description: $description) {
          id
          title
        }
      }
    `, { title: newTitle.value, description: newDescription.value });
    newTitle.value = '';
    newDescription.value = '';
    showCreateDialog.value = false;
    fetchPlaylists();
  } catch (err) {
    console.error('[PlaylistManager] Failed to create playlist:', err);
  }
}

onMounted(() => {
  onWorkerReady(() => {
    fetchPlaylists();
  });
});
</script>
