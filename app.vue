npm install @nuxtjs/vuetifynpm install @nuxtjs/vuetifynpm install @nuxtjs/vuetify@latest

<template>
  <v-app>
    <v-main>
      <v-container>
        <v-row justify="center">
          <v-col cols="12" md="8" lg="6">
            <v-card elevation="4" class="pa-6">
              <v-card-title class="text-h4 font-weight-bold">Curator Consultant</v-card-title>
              <v-card-text>
                <v-text-field
                  v-model="query"
                  label="Ask your question..."
                  @keyup.enter="performConsult"
                  :disabled="loading"
                  outlined
                  clearable
                />
                <v-btn
                  color="primary"
                  @click="performConsult"
                  :loading="loading"
                  :disabled="loading || !query.trim()"
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
                      <span v-if="result.metadata?.fileId">&nbsp;| File ID: {{ result.metadata.fileId }}</span>
                    </v-card-subtitle>
                    <v-card-text>
                      <pre>{{ result.content }}</pre>
                    </v-card-text>
                  </v-card>
                </div>
                <div v-if="!results && !loading && !error" class="text-center">
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
import { ref } from 'vue'

const query = ref('')
const results = ref<any>(null)
const loading = ref(false)
const error = ref<string | null>(null)

async function performConsult() {
  if (!query.value.trim()) return

  loading.value = true
  error.value = null
  results.value = null

  try {
    const data = await $fetch('/api/consult', {
      params: { query: query.value }
    })
    results.value = data
  } catch (e: any) {
    error.value = e.message || 'An error occurred while consulting.'
  } finally {
    loading.value = false
  }
}
</script>


