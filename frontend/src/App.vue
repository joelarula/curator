<template>
  <v-app theme="dark">
    <!-- Navigation Rail -->
    <v-navigation-drawer 
      v-model="drawer" 
      :rail="rail" 
      permanent 
      :width="rail ? 64 : sidebarWidth" 
      color="grey-darken-4" 
      class="border-e-0 sidebar-blur"
      @click="rail = false"
    >
      <!-- Resize Handle -->
      <div 
        v-if="!rail"
        class="resize-handle" 
        @mousedown.stop="startResize"
      ></div>
      <div class="pa-4 d-flex align-center" :class="{ 'justify-center': rail }">
        <v-icon color="primary" :size="rail ? 32 : 24" class="transition-all">mdi-brain-freeze-outline</v-icon>
        <span v-if="!rail" class="ms-3 text-h6 font-weight-black tracking-tight">PADA<span class="text-primary text-h6">GASKAR</span></span>
      </div>
      
      <v-list density="compact" nav class="px-3">
        <v-list-item prepend-icon="mdi-database-outline" title="Sources" :to="'/'" value="texts" rounded="lg"></v-list-item>
        <v-list-item prepend-icon="mdi-rss" title="Automated Feeds" :to="'/feeds'" value="feeds" rounded="lg"></v-list-item>
      </v-list>

      <v-divider v-if="!rail" class="mx-5 mb-2 opacity-5"></v-divider>

      <!-- The Hierarchical Wiki Tree -->
      <WikiSidebar v-if="!rail" />

      <template v-slot:append v-if="rail">
        <div class="pa-3 text-center">
          <v-btn icon="mdi-chevron-right" variant="text" size="small" @click.stop="rail = false"></v-btn>
        </div>
      </template>
    </v-navigation-drawer>

    <!-- Header bar -->
    <v-app-bar flat color="transparent" class="px-2 blur-bg" border="b">
      <v-btn icon="mdi-menu" variant="text" @click.stop="rail = !rail" class="me-2"></v-btn>
      
      <v-app-bar-title class="text-subtitle-1 font-weight-bold">
        {{ currentRouteName }}
      </v-app-bar-title>

      <v-btn icon="mdi-plus-circle-outline" variant="text" color="primary" class="me-2" @click="openEstablishSource"></v-btn>

      <v-spacer></v-spacer>

      <!-- User Menu in Top Bar -->
      <v-menu v-if="user" offset-y transition="scale-transition">
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

      <v-btn v-else color="primary" variant="flat" rounded="pill" size="small" class="px-6" @click="loginWithGoogle">
        Sign In
      </v-btn>
    </v-app-bar>

    <v-main>
      <!-- Not logged in -->
      <v-container v-if="!user" fluid class="pa-0 fill-height">
        <div class="fill-height w-100 d-flex align-center justify-center bg-dots">
          <v-card width="400" class="glass-card pa-8 text-center" rounded="xl" elevation="24">
            <v-icon size="64" color="primary" class="mb-6">mdi-brain-freeze-outline</v-icon>
            <h2 class="text-h4 font-weight-black mb-2 uppercase tracking-tighter">Padagaskar</h2>
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
      <EstablishSourceDialog />
    </v-main>

    <v-snackbar v-model="snackbar" :timeout="3000">
      {{ snackbarText }}
    </v-snackbar>
  </v-app>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth, user } from './composables/useAuth'
import { snackbar, snackbarText } from './composables/useGraphql'
import { openEstablishSource } from './composables/useGlobalActions'
import WikiSidebar from './components/WikiSidebar.vue'
import EstablishSourceDialog from './components/EstablishSourceDialog.vue'

const { fetchUser, loginWithGoogle, logout, initAuth, token } = useAuth()
const route = useRoute()

const rail = ref(false)
const drawer = ref(true)
const sidebarWidth = ref(parseInt(localStorage.getItem('sidebarWidth') || '280'))
const isResizing = ref(false)

function startResize() {
  isResizing.value = true
  document.addEventListener('mousemove', handleResize)
  document.addEventListener('mouseup', stopResize)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function handleResize(e: MouseEvent) {
  if (!isResizing.value) return
  // Minimum 200px, Maximum 600px
  const newWidth = Math.min(Math.max(200, e.clientX), 600)
  sidebarWidth.value = newWidth
}

function stopResize() {
  isResizing.value = false
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  localStorage.setItem('sidebarWidth', sidebarWidth.value.toString())
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

.resize-handle {
  position: absolute;
  top: 0;
  right: 0;
  width: 4px;
  height: 100%;
  cursor: col-resize;
  z-index: 100;
  transition: background-color 0.2s;
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

.v-navigation-drawer--rail:not(.v-navigation-drawer--is-hovering) .v-list-item__prepend {
  margin-inline-end: 0 !important;
}
</style>
