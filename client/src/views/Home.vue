<template>
  <v-app>
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
          <v-col cols="12" md="8" lg="6">
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
                  label="Ask your question..."
                  @keyup.enter="performConsult"
                  :disabled="loading || !user"
                  outlined
                  clearable
                />

                <v-btn
                  color="primary"
                  @click="performConsult"
                  :loading="loading"
                  :disabled="loading || !query.trim() || !user"
                  block
                  class="my-4"
                >
                  Ask
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
                    </v-card-subtitle>
                    <v-card-text>
                      <pre>{{ result.content }}</pre>
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
  </v-app>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useQuery, useMutation } from '@vue/apollo-composable'
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

const LOGOUT_MUTATION = gql`
  mutation Logout {
    logout
  }
`

const query = ref('')
const results = ref<any>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const user = ref<any>(null)

// Check for token in URL (from OAuth callback)
onMounted(() => {
  const urlParams = new URLSearchParams(window.location.search)
  const token = urlParams.get('token')
  if (token) {
    localStorage.setItem('token', token)
    window.history.replaceState({}, document.title, '/')
  }
  
  // Fetch current user
  fetchUser()
})

async function fetchUser() {
  const token = localStorage.getItem('token')
  if (!token) return

  const { result, error: queryError } = useQuery(ME_QUERY)
  
  if (queryError.value) {
    console.error('Error fetching user:', queryError.value)
    localStorage.removeItem('token')
    return
  }

  if (result.value) {
    user.value = result.value.me
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

async function performConsult() {
  if (!query.value.trim()) return

  loading.value = true
  error.value = null
  results.value = null

  try {
    const { result, error: queryError } = useQuery(CONSULT_QUERY, {
      query: query.value
    })

    if (queryError.value) {
      error.value = queryError.value.message
    } else if (result.value) {
      results.value = result.value.consult
    }
  } catch (e: any) {
    error.value = e.message || 'An error occurred while consulting.'
  } finally {
    loading.value = false
  }
}
</script>
