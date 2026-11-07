<template>
  <v-app>
    <!-- Top Application Bar -->
    <v-app-bar elevation="0" class="border-b" color="surface" density="comfortable">
      <v-container fluid class="d-flex align-center py-0" style="max-width: 1440px">
        <router-link to="/" class="d-flex align-center text-decoration-none text-high-emphasis ga-2">
          <v-icon color="primary" size="26">mdi-palette-outline</v-icon>
          <span class="text-subtitle-1 font-weight-bold tracking-wide">ARTMOMENTS</span>
        </router-link>

        <v-spacer />

        <div class="d-flex align-center ga-2">
          <v-btn
            to="/"
            variant="text"
            size="small"
            prepend-icon="mdi-view-gallery-outline"
          >
            Galerii
          </v-btn>

          <!-- Project Badge / Switcher when signed in -->
          <v-chip
            v-if="isAuthenticated"
            size="small"
            color="secondary"
            variant="tonal"
            prepend-icon="mdi-folder-key-outline"
            title="Active Gallery Project (bound via gallery.config.yaml)"
          >
            {{ activeProjectId }}
          </v-chip>

          <!-- Curator Console & Harness Links (Gated by Google Auth) -->
          <template v-if="isAuthenticated && isCuratorManager">
            <v-btn
              to="/admin"
              variant="tonal"
              color="primary"
              size="small"
              prepend-icon="mdi-view-dashboard-Edit-outline"
            >
              Harness
            </v-btn>

            <v-btn
              variant="outlined"
              color="primary"
              size="small"
              prepend-icon="mdi-console"
              @click="consoleDrawerOpen = !consoleDrawerOpen"
            >
              Console
            </v-btn>
          </template>

          <!-- Google OAuth Sign In / User Profile Controls -->
          <v-btn
            v-if="!isAuthenticated"
            variant="tonal"
            color="primary"
            size="small"
            prepend-icon="mdi-google"
            @click="loginWithGoogle"
          >
            Sign In
          </v-btn>

          <div v-else class="d-flex align-center ga-1">
            <v-chip size="small" variant="outlined" prepend-icon="mdi-account-check-outline">
              {{ user?.name || user?.email }}
            </v-chip>
            <v-btn
              icon="mdi-logout"
              size="small"
              variant="text"
              title="Sign Out"
              @click="logout"
            />
          </div>
        </div>
      </v-container>
    </v-app-bar>

    <v-main>
      <router-view />
    </v-main>

    <!-- Slide-out Curator Dev Console (Gated to authenticated Curator managers) -->
    <CuratorConsole
      v-if="isAuthenticated && isCuratorManager"
      v-model="consoleDrawerOpen"
      :adapter="galleryCuratorAdapter"
    />
  </v-app>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { CuratorConsole } from '@curator/console';
import { galleryCuratorAdapter } from './curator-adapter';
import { useAuth } from './composables/useAuth';

const {
  user,
  activeProjectId,
  isAuthenticated,
  isCuratorManager,
  initAuth,
  loginWithGoogle,
  logout,
} = useAuth();

const consoleDrawerOpen = ref(false);

function handleKeyDown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === '`') {
    e.preventDefault();
    if (isAuthenticated.value && isCuratorManager.value) {
      consoleDrawerOpen.value = !consoleDrawerOpen.value;
    }
  }
}

onMounted(async () => {
  window.addEventListener('keydown', handleKeyDown);
  await initAuth();
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
});
</script>
