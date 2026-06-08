<template>
  <v-app theme="dark">
    <!-- Navigation Rail -->
    <v-navigation-drawer 
      v-model="drawer" 
      rail 
      permanent 
      rail-width="56"
      color="grey-darken-4" 
      class="border-e-0 sidebar-blur"
    >
      <div class="pa-3 d-flex align-center justify-center">
        <v-icon color="primary" size="24" class="transition-all">mdi-brain-freeze-outline</v-icon>
      </div>

      
      <div class="pa-2 d-flex flex-column align-center ga-1">
        <v-btn
          icon="mdi-database-outline"
          :to="'/'"
          :variant="route.path === '/' ? 'tonal' : 'text'"
          color="primary"
          rounded="lg"
          size="40"
        ></v-btn>
        <v-btn
          icon="mdi-robot-outline"
          :to="'/agents'"
          :variant="route.path.startsWith('/agents') ? 'tonal' : 'text'"
          color="primary"
          rounded="lg"
          size="40"
        ></v-btn>
      </div>



      <v-divider v-if="!rail" class="mx-5 mb-2 opacity-5"></v-divider>
    </v-navigation-drawer>

    <!-- Header bar -->
    <v-app-bar flat color="transparent" class="px-2 blur-bg" border="b">
      <v-app-bar-title class="text-subtitle-1 font-weight-bold">
        {{ currentRouteName }}
      </v-app-bar-title>

      <v-btn icon="mdi-plus-circle-outline" variant="text" color="primary" class="me-2" @click="openEstablishResource" title="New Resource"></v-btn>
      <v-btn icon="mdi-robot-outline" variant="text" color="primary" class="me-2" @click="openDeployAgent" title="Deploy Agent"></v-btn>

      <v-spacer></v-spacer>

      <DatabaseSelector v-if="isExtension" @database-changed="onDatabaseChanged" />
      <ProjectSelector v-if="!isExtension && user" @project-changed="onProjectChanged" />

      <!-- User Menu in Top Bar -->
      <v-menu v-if="user && !isExtension" offset-y transition="scale-transition">
        <template v-slot:activator="{ props }">
          <v-btn v-bind="props" variant="text" class="text-none">
            <v-avatar size="32" color="primary" class="me-2" variant="tonal">
              <v-icon size="18">mdi-account</v-icon>
            </v-avatar>
            <span class="text-body-2 font-weight-medium me-1">{{ user.name || user.email.split('@')[0] }}</span>
            <v-icon size="small">mdi-chevron-down</v-icon>
          </v-btn>
        </template>
        <v-list density="compact" min-width="200" rounded="lg" class="pa-2 mt-2">
          <v-list-item prepend-icon="mdi-account-outline" title="Profile" rounded="lg"></v-list-item>
          <v-list-item prepend-icon="mdi-cog-outline" title="Settings" rounded="lg"></v-list-item>
          <v-divider class="my-2 opacity-5"></v-divider>
          <v-list-item prepend-icon="mdi-logout-variant" title="Logout" color="error" rounded="lg" @click="logout"></v-list-item>
        </v-list>
      </v-menu>

      <v-btn v-if="!user && !isExtension" color="primary" variant="flat" rounded="pill" size="small" class="px-6" @click="loginWithGoogle">
        Sign In
      </v-btn>
    </v-app-bar>

    <v-main>
      <!-- Not logged in -->
      <v-container v-if="!user" fluid class="pa-0 fill-height">
        <div class="fill-height w-100 d-flex align-center justify-center bg-dots">
          <v-card width="400" class="glass-card pa-8 text-center" rounded="xl" elevation="24">
            <v-icon size="64" color="primary" class="mb-6">mdi-brain-freeze-outline</v-icon>
            <h2 class="text-h4 font-weight-black mb-2 uppercase tracking-tighter">Curator</h2>
            <p class="mb-8 text-grey text-body-2">Advanced Intelligence Studio for <br/> Rhetoric & Text Analysis</p>

            <v-btn color="primary" size="large" rounded="pill" block @click="loginWithGoogle" class="py-4">
              <v-icon start>mdi-google</v-icon>
              Continue with Google
            </v-btn>
          </v-card>
        </div>
      </v-container>

      <!-- Logged in - show routed page -->
      <router-view v-else class="fade-in" />

      <!-- Global Actions -->
      <EstablishResourceDialog />
      <DeployAgentDialog />
    </v-main>


    <v-snackbar v-model="snackbar" :timeout="snackbarTimeout">
      {{ snackbarText }}
      <template #actions>
        <v-btn v-if="snackbarIsError" variant="text" @click="snackbar = false">
          Close
        </v-btn>
      </template>
    </v-snackbar>
  </v-app>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth, user } from './composables/useAuth'
import { snackbar, snackbarText, snackbarTimeout, snackbarIsError } from './composables/useGraphql'
import { openEstablishResource, openDeployAgent } from './composables/useGlobalActions'
import { isExtensionContext } from './composables/useEnv'
import WikiSidebar from './components/WikiSidebar.vue'
import EstablishResourceDialog from './components/EstablishResourceDialog.vue'
import DeployAgentDialog from './components/DeployAgentDialog.vue'
import DatabaseSelector from './components/DatabaseSelector.vue'
import ProjectSelector from './components/ProjectSelector.vue'

const { fetchUser, loginWithGoogle, logout, initAuth, token } = useAuth()
const route = useRoute()
const isExtension = isExtensionContext()

const rail = ref(true)
const drawer = ref(true)

function onDatabaseChanged() {
  window.location.reload()
}

function onProjectChanged() {
  window.location.reload()
}

const currentRouteName = computed(() => {
  return (route.name as string)?.toUpperCase() || 'PADAGASKAR'
})

onMounted(async () => {
  initAuth()
  if (token.value) {
    await fetchUser()
  }
})
</script>

<style>
.sidebar-blur {
  backdrop-filter: blur(20px);
  background-color: rgba(18, 18, 18, 0.8) !important;
}

.blur-bg {
  backdrop-filter: blur(12px);
  background-color: rgba(18, 18, 18, 0.5) !important;
}

.bg-dots {
  background-image: radial-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px);
  background-size: 30px 30px;
}

.glass-card {
  backdrop-filter: blur(16px);
  background-color: rgba(255, 255, 255, 0.03) !important;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.transition-all {
  transition: all 0.3s ease;
}

.resize-handle:hover {
  background-color: rgba(var(--v-theme-primary), 0.3);
}

.resize-handle:active {
  background-color: rgba(var(--v-theme-primary), 0.8);
}

.fade-in {
  animation: fadeIn 0.4s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.tracking-tight {
  letter-spacing: -0.05em;
}

</style>
