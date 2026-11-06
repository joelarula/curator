<template>
  <v-app theme="dark" class="blueprint-app-root">
    <!-- Top Navigation / Application Bar -->
    <v-app-bar flat color="surface" border="b" density="comfortable" class="px-3">
      <div class="d-flex align-center ga-3">
        <v-avatar color="primary" variant="flat" size="32" class="elevation-2">
          <span class="text-caption font-weight-bold">⚡</span>
        </v-avatar>
        <div>
          <v-app-bar-title class="text-subtitle-1 font-weight-bold pa-0 lh-1">
            Curator Blueprint
          </v-app-bar-title>
          <div class="text-caption text-medium-emphasis">
            Standard Agent Harness &amp; Vuetify over GraphQL
          </div>
        </div>
      </div>

      <v-spacer />

      <div class="d-flex align-center ga-2">
        <!-- Curator Dev Console Trigger Button -->
        <v-btn
          variant="tonal"
          size="small"
          :color="consoleOpen ? 'primary' : 'default'"
          prepend-icon="mdi-console"
          append-icon="mdi-keyboard"
          @click="consoleOpen = !consoleOpen"
        >
          Curator Console
        </v-btn>
      </div>
    </v-app-bar>

    <!-- Main Content: Embedded Full-Page Standard Harness -->
    <v-main>
      <CuratorHarness
        :adapter="blueprintCuratorAdapter"
        title="Curator Blueprint Harness"
        subtitle="Standard Operator Prompt (OpPrompt) &amp; Execution Testbench over GraphQL"
        :standalone="true"
        :hide-header="true"
      />
    </v-main>

    <!-- Curator Dev Console Drawer Teleport -->
    <CuratorConsole
      v-model="consoleOpen"
      :adapter="blueprintCuratorAdapter"
      title="Curator Blueprint Console"
    />
  </v-app>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { CuratorConsole, CuratorHarness } from '@curator/console';
import { blueprintCuratorAdapter } from './curator-adapter';

const consoleOpen = ref(false);

function handleKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === '`') {
    e.preventDefault();
    consoleOpen.value = !consoleOpen.value;
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<style scoped>
.blueprint-app-root {
  background: #090c13 !important;
}

.lh-1 {
  line-height: 1.2 !important;
}
</style>
