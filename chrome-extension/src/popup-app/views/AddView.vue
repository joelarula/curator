<template>
  <div class="pa-3">
    <!-- Form -->
    <v-card variant="outlined" class="pa-4 mb-3" style="border-color: rgba(192,132,252,0.2);">
      <div class="text-caption text-medium-emphasis font-weight-bold mb-3" style="letter-spacing: 0.05em;">
        <v-icon icon="mdi-plus-circle" size="14" color="primary" class="mr-1" />
        Add New Resource
      </div>

      <v-text-field
        v-model="form.uri"
        label="URL / URI"
        placeholder="https://example.com/article"
        prepend-inner-icon="mdi-link"
        hide-details="auto"
        :rules="[v => !!v || 'URI is required']"
        class="mb-3"
      />

      <v-text-field
        v-model="form.title"
        label="Title (optional)"
        placeholder="My Article Title"
        prepend-inner-icon="mdi-format-title"
        hide-details
        class="mb-3"
      />

      <v-textarea
        v-model="form.description"
        label="Description (optional)"
        rows="2"
        hide-details
        auto-grow
        class="mb-4"
      />

      <v-btn
        color="primary"
        block
        :loading="saving"
        :disabled="!form.uri.trim()"
        prepend-icon="mdi-content-save"
        @click="save"
      >
        Save to Knowledge Graph
      </v-btn>
    </v-card>

    <!-- Quick action chips -->
    <div class="text-caption text-disabled mb-2">Quick Actions</div>
    <div class="d-flex gap-2 flex-wrap">
      <v-chip
        size="small"
        variant="tonal"
        color="secondary"
        prepend-icon="mdi-web"
        @click="fillCurrentTab"
      >
        Add Current Tab
      </v-chip>
    </div>

    <v-snackbar v-model="snackbar.show" :timeout="3000" :color="snackbar.color" location="top">
      <v-icon :icon="snackbar.icon" class="mr-2" />
      {{ snackbar.message }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, inject } from 'vue'

const gql = inject<(q: string, v?: any) => Promise<any>>('gql')!

const form = ref({ uri: '', title: '', description: '' })
const saving = ref(false)

const snackbar = ref({ show: false, message: '', color: 'success', icon: 'mdi-check' })

function showSnack(message: string, color = 'success', icon = 'mdi-check') {
  snackbar.value = { show: true, message, color, icon }
}

async function save() {
  if (!form.value.uri.trim()) return
  saving.value = true
  try {
    const resp = await gql(
      `mutation Add($input: ResourceInput!) {
         upsertResource(input: $input) { id uri title }
       }`,
      { input: { uri: form.value.uri, title: form.value.title || form.value.uri, description: form.value.description } }
    )
    if (resp?.errors?.length) {
      showSnack(resp.errors[0].message, 'error', 'mdi-alert')
    } else {
      showSnack(`"${resp.data.upsertResource.title}" saved!`, 'success', 'mdi-check-circle')
      form.value = { uri: '', title: '', description: '' }
    }
  } catch (err: any) {
    showSnack(err.message, 'error', 'mdi-alert')
  } finally {
    saving.value = false
  }
}

async function fillCurrentTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0]
    if (tab) {
      form.value.uri   = tab.url   || ''
      form.value.title = tab.title || ''
    }
  })
}
</script>
