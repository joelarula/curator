<template>
  <div>
    <!-- Unauthenticated Google Web Auth Gate -->
    <v-container v-if="!isAuthenticated" class="py-12" style="max-width: 560px">
      <v-card elevation="2" rounded="lg" class="border pa-6 text-center">
        <v-avatar color="primary" variant="tonal" size="64" class="mb-4">
          <v-icon size="34">mdi-shield-lock-outline</v-icon>
        </v-avatar>
        <h2 class="text-h5 font-weight-bold mb-2">
          Curator Gallery Administration
        </h2>
        <p class="text-body-2 text-medium-emphasis mb-6">
          Sign in with your Google account mapped to a gallery project in
          <code>gallery.config.yaml</code> to access the Curator Console, upload artworks, and manage resources.
        </p>
        <v-btn
          color="primary"
          size="large"
          variant="flat"
          prepend-icon="mdi-google"
          @click="loginWithGoogle"
        >
          Sign in with Google
        </v-btn>
      </v-card>
    </v-container>

    <!-- Authenticated Curator Harness (Top-Down Stack & 2-Column Worktable) -->
    <CuratorHarness
      v-else
      :adapter="galleryCuratorAdapter"
      :title="`Curator Gallery Console (${activeProjectId})`"
      :subtitle="`Signed in as ${user?.email} | Top-Down Stack & 2-Column Scene Worktable`"
    />
  </div>
</template>

<script setup lang="ts">
import { CuratorHarness } from '@curator/console';
import { galleryCuratorAdapter } from '../curator-adapter';
import { useAuth } from '../composables/useAuth';

const { user, activeProjectId, isAuthenticated, loginWithGoogle } = useAuth();
</script>
