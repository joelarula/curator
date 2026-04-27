<template>
  <v-app>
    <v-app-bar color="primary" dark app shadow>
      <v-toolbar-title>Curator Consultant</v-toolbar-title>
      <v-spacer />

      <div v-if="user">
        <UserMenu :user="user" @login="handleLogin" @logout="handleLogout" />
      </div>
      <v-btn v-else @click="handleLogin" variant="outlined" prepend-icon="mdi-google">
        Sign In
      </v-btn>

      <!-- Desktop-style Menu Bar as Extension - Only for logged in users -->
      <template v-if="user" v-slot:extension>
        <v-toolbar color="surface-variant" density="compact" flat>
          <ProjectMenu 
            :user="user" 
            :projectsList="projectsList" 
            :currentProject="currentProject"
            @show-create="showCreateDialog = true"
            @select="selectProject"
            @confirm-delete="confirmDeleteProject"
          />

          <v-spacer />

          <ProjectIndicator :user="user" :currentProject="currentProject" />
        </v-toolbar>
      </template>
    </v-app-bar>

    <v-main>
      <template v-if="user">
        <router-view :user="user" :currentProject="currentProject" />
      </template>
      <template v-else>
        <v-container class="fill-height" fluid>
          <v-row align="center" justify="center">
            <v-col cols="12" sm="8" md="6" class="text-center">
              <h1 class="text-h2 font-weight-bold mb-4">Welcome to Curator</h1>
              <p class="text-h5 text-medium-emphasis mb-8">
                Your intelligent personal knowledge assistant. Organize, search, and consult your documents with ease.
              </p>
              <v-btn
                color="primary"
                size="x-large"
                @click="handleLogin"
                prepend-icon="mdi-google"
                elevation="4"
              >
                Get Started with Google
              </v-btn>
            </v-col>
          </v-row>
        </v-container>
      </template>
    </v-main>

    <!-- Create Project Dialog -->
    <v-dialog v-model="showCreateDialog" max-width="500px">
      <v-card>
        <v-card-title>Create New Project</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="newProjectName"
            label="Project Name"
            outlined
            @keyup.enter="createProject"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showCreateDialog = false">Cancel</v-btn>
          <v-btn color="primary" @click="createProject" :disabled="!newProjectName.trim()">
            Create
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete Confirmation Dialog -->
    <v-dialog v-model="showDeleteDialog" max-width="500px">
      <v-card>
        <v-card-title>Delete Project</v-card-title>
        <v-card-text>
          Are you sure you want to delete "{{ projectToDelete?.name }}"? This will permanently delete all files and data associated with this project.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showDeleteDialog = false">Cancel</v-btn>
          <v-btn color="error" @click="deleteProject">Delete</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-app>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useMutation, useQuery } from '@vue/apollo-composable'
import { apolloClient } from './apollo'
import gql from 'graphql-tag'
import UserMenu from './modules/user/components/UserMenu.vue'
import ProjectMenu from './modules/project/components/ProjectMenu.vue'
import ProjectIndicator from './modules/project/components/ProjectIndicator.vue'

const ME_QUERY = gql`
  query Me {
    me {
      id
      email
      name
    }
  }
`

const PROJECTS_QUERY = gql`
  query Projects {
    projects {
      id
      name
      fileCount
      createdAt
      updatedAt
    }
  }
`

const CREATE_PROJECT_MUTATION = gql`
  mutation CreateProject($name: String!) {
    createProject(name: $name) {
      id
      name
      fileCount
    }
  }
`

const DELETE_PROJECT_MUTATION = gql`
  mutation DeleteProject($id: Int!) {
    deleteProject(id: $id)
  }
`

const SELECT_PROJECT_MUTATION = gql`
  mutation SelectProject($id: Int!) {
    selectProject(id: $id) {
      id
      name
      fileCount
    }
  }
`

const LOGOUT_MUTATION = gql`
  mutation Logout {
    logout
  }
`

const user = ref<any>(null)
const projectsList = ref<any[]>([])
const currentProject = ref<any>(null)
const showCreateDialog = ref(false)
const showDeleteDialog = ref(false)
const newProjectName = ref('')
const projectToDelete = ref<any>(null)

onMounted(async () => {
  const urlParams = new URLSearchParams(window.location.search)
  const token = urlParams.get('token')
  if (token) {
    localStorage.setItem('token', token)
    window.history.replaceState({}, document.title, '/')
  }
  
  const storedToken = localStorage.getItem('token')
  if (storedToken) {
    await fetchUser()
    await fetchProjects()
  }
})

async function fetchUser() {
  try {
    const { data } = await apolloClient.query({
      query: ME_QUERY,
      fetchPolicy: 'network-only'
    })
    if (data?.me) {
      user.value = data.me
    }
  } catch (err: any) {
    console.error('Error fetching user:', err)
    localStorage.removeItem('token')
    user.value = null
  }
}

async function fetchProjects() {
  try {
    const { data } = await apolloClient.query({
      query: PROJECTS_QUERY,
      fetchPolicy: 'network-only'
    })
    if (data?.projects) {
      projectsList.value = data.projects
      // Auto-select first project if none selected
      if (!currentProject.value && projectsList.value.length > 0) {
        currentProject.value = projectsList.value[0]
      }
    }
  } catch (err: any) {
    console.error('Error fetching projects:', err)
  }
}

async function createProject() {
  if (!newProjectName.value.trim()) return
  
  try {
    const { data } = await apolloClient.mutate({
      mutation: CREATE_PROJECT_MUTATION,
      variables: { name: newProjectName.value }
    })
    
    if (data?.createProject) {
      await fetchProjects()
      currentProject.value = data.createProject
      newProjectName.value = ''
      showCreateDialog.value = false
    }
  } catch (err: any) {
    console.error('Error creating project:', err)
    alert('Failed to create project: ' + err.message)
  }
}

function confirmDeleteProject(project: any) {
  projectToDelete.value = project
  showDeleteDialog.value = true
}

async function deleteProject() {
  if (!projectToDelete.value) return
  
  try {
    await apolloClient.mutate({
      mutation: DELETE_PROJECT_MUTATION,
      variables: { id: projectToDelete.value.id }
    })
    
    // If deleted project was selected, clear selection
    if (currentProject.value?.id === projectToDelete.value.id) {
      currentProject.value = null
    }
    
    await fetchProjects()
    showDeleteDialog.value = false
    projectToDelete.value = null
  } catch (err: any) {
    console.error('Error deleting project:', err)
    alert('Failed to delete project: ' + err.message)
  }
}

async function selectProject(project: any) {
  try {
    const { data } = await apolloClient.mutate({
      mutation: SELECT_PROJECT_MUTATION,
      variables: { id: project.id }
    })
    
    if (data?.selectProject) {
      currentProject.value = data.selectProject
    }
  } catch (err: any) {
    console.error('Error selecting project:', err)
  }
}

function handleLogin() {
  window.location.href = '/auth/google'
}

async function handleLogout() {
  const { mutate } = useMutation(LOGOUT_MUTATION)
  await mutate()
  localStorage.removeItem('token')
  user.value = null
  currentProject.value = null
  projectsList.value = []
}
</script>
