<template>
  <v-menu v-model="menu" :close-on-content-click="false" location="bottom end">
    <template v-slot:activator="{ props }">
      <v-btn v-bind="props" variant="text" size="small" class="text-none mr-2">
        <v-icon>mdi-folder-outline</v-icon>
        <span class="ml-1">{{ activeProjectName }}</span>
        <v-icon>mdi-chevron-down</v-icon>
      </v-btn>
    </template>

    <v-card min-width="260" class="bg-surface">
      <v-list class="bg-transparent" density="compact">
        <v-list-item
          v-for="project in projects"
          :key="project.id"
          :active="project.id === activeId"
          @click="setActiveProject(project.id)"
        >
          <template v-slot:prepend>
            <v-icon :color="project.id === activeId ? 'primary' : 'grey'">mdi-folder</v-icon>
          </template>
          <v-list-item-title>{{ project.name }}</v-list-item-title>
          <template v-slot:append>
            <v-btn icon="mdi-delete" size="x-small" variant="text" color="error" @click.stop="deleteProject(project.id)" />
          </template>
        </v-list-item>
      </v-list>

      <v-divider></v-divider>

      <v-card-text class="pt-2 pb-2">
        <div v-if="!isCreating">
          <v-btn block variant="tonal" size="small" prepend-icon="mdi-plus" @click="isCreating = true">
            New Project
          </v-btn>
        </div>
        <div v-else class="d-flex align-center">
          <v-text-field
            v-model="newProjectName"
            density="compact"
            variant="outlined"
            hide-details
            placeholder="Project name"
            autofocus
            @keyup.enter="createProject"
            @keyup.esc="cancelCreate"
          ></v-text-field>
          <v-btn icon="mdi-check" size="small" color="primary" variant="text" class="ml-1" @click="createProject" :disabled="!newProjectName.trim()" />
          <v-btn icon="mdi-close" size="small" color="error" variant="text" @click="cancelCreate" />
        </div>
      </v-card-text>
    </v-card>
  </v-menu>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { graphql } from '../composables/useGraphql'

const menu = ref(false)
const isCreating = ref(false)
const newProjectName = ref('')
const activeId = ref('')
const projects = ref<Array<{ id: string; name: string }>>([])

const emit = defineEmits(['project-changed'])

const activeProjectName = computed(() => {
  const active = projects.value.find((p) => p.id === activeId.value)
  return active?.name || 'Default Project'
})

function saveActiveProject(id: string) {
  activeId.value = id
  localStorage.setItem('activeProjectId', id)
}

function cancelCreate() {
  isCreating.value = false
  newProjectName.value = ''
}

async function fetchProjects() {
  const resp = await graphql('query { projects { id name } }')
  if (!resp?.projects) return

  projects.value = resp.projects

  if (!projects.value.length) {
    activeId.value = ''
    localStorage.removeItem('activeProjectId')
    return
  }

  const stored = localStorage.getItem('activeProjectId')
  const storedExists = stored && projects.value.some((p) => p.id === stored)
  if (storedExists) {
    activeId.value = stored as string
    return
  }

  saveActiveProject(projects.value[0].id)
}

async function setActiveProject(id: string) {
  if (id === activeId.value) {
    menu.value = false
    return
  }

  saveActiveProject(id)
  menu.value = false
  emit('project-changed')
}

async function createProject() {
  const name = newProjectName.value.trim()
  if (!name) return

  const resp = await graphql('mutation($name: String!) { createProject(name: $name) { id name } }', { name })
  if (!resp?.createProject) return

  cancelCreate()
  await fetchProjects()
  saveActiveProject(resp.createProject.id)
  emit('project-changed')
}

async function deleteProject(id: string) {
  if (!confirm('Are you sure you want to delete this project?')) return

  const wasActive = id === activeId.value
  const resp = await graphql('mutation($id: ID!) { deleteProject(id: $id) }', { id })
  if (!resp?.deleteProject) return

  await fetchProjects()

  if (wasActive && projects.value.length > 0) {
    saveActiveProject(projects.value[0].id)
  }

  emit('project-changed')
}

onMounted(async () => {
  await fetchProjects()
})
</script>
