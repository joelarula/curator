<template>
  <v-app-bar color="surface" elevation="2" border>
    <v-app-bar-title class="d-flex align-center font-weight-bold">
      <v-icon icon="mdi-record-player" color="primary" class="mr-2" />
      Keeris Kauamängiv <span class="text-caption text-medium-emphasis ml-2">WASM + OPFS SQLite</span>
    </v-app-bar-title>

    <v-spacer />

    <v-chip color="success" size="small" variant="tonal" class="mr-3">
      <v-icon start icon="mdi-database-check" />
      OPFS SQLite Ready
    </v-chip>

    <v-btn
      color="secondary"
      variant="tonal"
      size="small"
      class="mr-2"
      prepend-icon="mdi-database-sync"
      :loading="syncing"
      @click="syncSeed"
    >
      Re-sync Seed DB
      <v-tooltip activator="parent" location="bottom">Hydrate 9,355+ episodes & 109,000+ tracks into OPFS SQLite</v-tooltip>
    </v-btn>

    <v-btn
      icon="mdi-robot"
      variant="tonal"
      color="primary"
      class="mr-2"
      @click="$emit('toggle-drawer')"
    >
      <v-tooltip activator="parent" location="bottom">Curator AST Engine</v-tooltip>
    </v-btn>
  </v-app-bar>
</template>

<script setup>
import { ref } from 'vue';
import { rehydrateSeed } from '@wasm/graphql-client.js';

const emit = defineEmits(['toggle-drawer', 'seed-synced']);
const syncing = ref(false);

async function syncSeed() {
  syncing.value = true;
  try {
    await rehydrateSeed();
    emit('seed-synced');
    window.location.reload();
  } catch (err) {
    console.error('[KeerisHeader] Failed to sync seed:', err);
  } finally {
    syncing.value = false;
  }
}
</script>
