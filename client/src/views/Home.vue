
<template>
  <div>
    <v-app-bar color="primary" dark>
      <v-toolbar-title>Curator Consultant</v-toolbar-title>
      <v-spacer />
      <div v-if="user">
        <v-chip class="mr-2">
          {{ user.name || user.email }}
        </v-chip>
        <v-btn @click="handleLogout" variant="outlined">Sign Out</v-btn>
      </div>
      <v-btn v-else @click="handleLogin" variant="outlined">
        Sign In with Google
      </v-btn>
    </v-app-bar>

    <v-main>
      <v-container>
        <v-row justify="center">
          <v-col cols="12" md="10" lg="10" xl="8">
            <v-card elevation="4" class="pa-6">
              <v-card-title class="text-h4 font-weight-bold">
                Curator Consultant
              </v-card-title>
              <v-card-text>
                <v-alert v-if="!user" type="info" class="mb-4">
                  Please sign in to use the consultant.
                </v-alert>

                <v-text-field
                  v-model="query"
                  label="Ask your question (optional)..."
                  @keyup.enter="performAction"
                  :disabled="loading || !user"
                  outlined
                  clearable
                />

                <v-file-input
                  v-model="files"
                  label="Upload files (optional)"
                  :disabled="loading || !user"
                  multiple
                  outlined
                  clearable
                  show-size
                  counter
                  class="mb-2"
                />

                <v-btn
                  color="primary"
                  @click="performAction"
                  :loading="loading"
                  :disabled="loading || (!query.trim() && files.length === 0) || !user"
                  block
                  class="my-4"
                >
                  {{ files.length > 0 ? 'Add Content' : 'Ask' }}
                </v-btn>

                <v-alert v-if="error" type="error" prominent>
                  {{ error }}
                </v-alert>

                <div v-if="results">
                  <v-card
                    v-for="(result, index) in results"
                    :key="index"
                    outlined
                    class="mb-4"
                  >
                    <v-card-subtitle>
                      <span>Score: {{ result.score.toFixed(4) }}</span>
                      <span v-if="result.metadata?.fileId">
                        &nbsp;| File ID: {{ result.metadata.fileId }}
                      </span>
                      <span v-if="result.metadata?.isAnswer" class="ml-2">
                        <v-chip size="small" color="primary">AI Answer</v-chip>
                      </span>
                    </v-card-subtitle>
                    <v-card-text style="white-space: pre-wrap; word-wrap: break-word; overflow-wrap: break-word; font-size: 1.1rem; line-height: 1.6;">
                      {{ result.content }}
                    </v-card-text>
                  </v-card>
                </div>

                <div v-if="!results && !loading && !error && user" class="text-center">
                  <p>Enter a query to search the knowledge base.</p>
                </div>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </v-container>
    </v-main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useMutation, useQuery } from '@vue/apollo-composable'
import { apolloClient } from '../apollo'
import gql from 'graphql-tag'

const ME_QUERY = gql`
  query Me {
    me {
      id
      email
      name
    }
  }
`

const CONSULT_QUERY = gql`
  query Consult($query: String!) {
    consult(query: $query) {
      content
      score
      metadata {
        fileId
      }
    }
  }
`

const RAG_AGENT_QUERY = gql`
  query RagAgent($query: String!) {
    ragAgent(query: $query) {
      answer
      sources {
        content
        score
        metadata {
          fileId
        }
      }
    }
  }
`

const LOGOUT_MUTATION = gql`
  mutation Logout {
    logout
  }
`

const UPLOAD_FILES_MUTATION = gql`
  mutation UploadFiles($files: [FileInput!]!, $projectId: Int, $description: String, $query: String) {
    uploadFiles(files: $files, projectId: $projectId, description: $description, query: $query) {
      success
      message
      fileIds
      results {
        content
        score
        metadata {
          fileId
        }
      }
    }
  }
`

const query = ref('')
const files = ref<File[]>([])
const results = ref<any>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const user = ref<any>(null)


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

function handleLogin() {
  window.location.href = '/auth/google'
}

async function handleLogout() {
  const { mutate } = useMutation(LOGOUT_MUTATION)
  await mutate()
  localStorage.removeItem('token')
  user.value = null
  results.value = null
}

async function performAction() {
  if (!query.value.trim() && files.value.length === 0) return

  loading.value = true
  error.value = null
  results.value = null

  try {
    if (files.value.length > 0) {
      // Upload files
      await uploadFiles()
    } else {
      // Use RAG agent for queries
      const { data } = await apolloClient.query({
        query: RAG_AGENT_QUERY,
        variables: { query: query.value },
        fetchPolicy: 'network-only'
      })
      
      if (data?.ragAgent) {
        // Show AI answer as first result, followed by sources
        results.value = [
          {
            content: data.ragAgent.answer,
            score: 1.0,
            metadata: { isAnswer: true }
          },
          ...data.ragAgent.sources
        ]
      }
    }
  } catch (e: any) {
    error.value = e.message || 'An error occurred.'
  } finally {
    loading.value = false
  }
}

async function uploadFiles() {
  try {
    const fileInputs = await Promise.all(
      files.value.map(async (file) => {
        const content = await readFileAsBase64(file)
        return {
          name: file.name,
          content,
          mimeType: file.type || 'application/octet-stream',
          size: file.size
        }
      })
    )

    const { data } = await apolloClient.mutate({
      mutation: UPLOAD_FILES_MUTATION,
      variables: {
        files: fileInputs,
        projectId: 1, // Default project
        description: query.value || undefined,
        query: query.value || undefined
      }
    })

    if (data?.uploadFiles?.success) {
      // Show search results if query was provided, otherwise show upload confirmation
      if (data.uploadFiles.results && data.uploadFiles.results.length > 0) {
        results.value = data.uploadFiles.results
      } else {
        results.value = [{
          content: data.uploadFiles.message,
          score: 1.0,
          metadata: { fileIds: data.uploadFiles.fileIds }
        }]
      }
      // Clear inputs after successful upload
      files.value = []
      query.value = ''
    }
  } catch (err: any) {
    throw err
  }
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
</script>
