<template>
  <v-dialog v-model="showEstablishResourceDialog" max-width="800">
    <v-card rounded="xl" class="pa-4 glass-card">
      <div class="pa-4 text-h5 font-weight-black uppercase tracking-tighter d-flex align-center ga-3">
        <v-icon color="primary">mdi-rhombus-plus</v-icon>
        Establish Resource
      </div>
      
      <v-tabs v-model="createTab" color="primary" grow class="mb-4">
        <v-tab value="url">Discovery via URL</v-tab>
        <v-tab value="manual">Manual Register</v-tab>
      </v-tabs>

      <v-window v-model="createTab" style="max-height: 70vh; overflow-y: auto;" class="pr-2 px-4">
        <!-- URL Discovery -->
        <v-window-item value="url">
          <v-card-text class="pa-0 pt-4">
            <div class="text-body-2 mb-6 text-grey">
              The Agentic pipeline will attempt to scrape and categorize the provided URI automatically.
            </div>
            <v-text-field
              v-model="resourceForm.uri"
              label="Resource URI / URL"
              variant="solo-filled"
              prepend-inner-icon="mdi-link-variant"
              placeholder="https://..."
              class="mb-4"
              hide-details
            ></v-text-field>
            
            <v-checkbox
              v-model="triggerAgent"
              label="Auto-scrape & Categorize with Default Agent"
              color="primary"
              density="compact"
            ></v-checkbox>
          </v-card-text>
        </v-window-item>

        <!-- Manual Entry -->
        <v-window-item value="manual">
          <v-card-text class="pa-0 pt-4">
            <v-row>
              <v-col cols="12">
                <v-text-field
                  v-model="resourceForm.uri"
                  label="Unique Identity URI"
                  variant="solo-filled"
                  prepend-inner-icon="mdi-identifier"
                  class="mb-4"
                  placeholder="e.g. concept:artificial-intelligence"
                  persistent-placeholder
                ></v-text-field>
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="resourceForm.title"
                  label="Display Title"
                  variant="solo-filled"
                  class="mb-4"
                ></v-text-field>
              </v-col>
              <v-col cols="12" md="6">
                <v-select
                  v-model="resourceForm.isPublished"
                  :items="[{ title: 'Published', value: true }, { title: 'Draft', value: false }]"
                  label="Visibility"
                  variant="solo-filled"
                  class="mb-4"
                ></v-select>
              </v-col>
            </v-row>

            <v-textarea
              v-model="resourceForm.description"
              label="Initial Context / Description"
              variant="solo-filled"
              rows="4"
              auto-grow
              placeholder="Brief summary of what this resource represents..."
            ></v-textarea>
          </v-card-text>
        </v-window-item>
      </v-window>

      <v-card-actions class="mt-6 px-4">
        <v-spacer></v-spacer>
        <v-btn variant="text" @click="showEstablishResourceDialog = false">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          rounded="pill"
          class="px-10"
          :loading="loading"
          :disabled="!resourceForm.uri.trim()"
          @click="establishResource"
        >
          Establish
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { graphql, showSuccess } from '../composables/useGraphql'
import { showEstablishResourceDialog } from '../composables/useGlobalActions'

const router = useRouter()
const loading = ref(false)
const createTab = ref('url')
const triggerAgent = ref(true)

const resourceForm = ref({
  uri: '',
  title: '',
  description: '',
  isPublished: false
})

async function establishResource() {
  if (!resourceForm.value.uri.trim()) return
  loading.value = true
  
  try {
    const data = await graphql(`
      mutation($input: ResourceInput!) {
        upsertResource(input: $input) { 
            id 
            uri 
            title
        }
      }
    `, {
      input: {
        uri: resourceForm.value.uri.trim(),
        title: resourceForm.value.title.trim() || undefined,
        description: resourceForm.value.description.trim() || undefined,
        isPublished: resourceForm.value.isPublished
      }
    })

    if (data?.upsertResource) {
      showSuccess(`Resource "${data.upsertResource.title || data.upsertResource.uri}" established`)
      showEstablishResourceDialog.value = false
      
      const resId = data.upsertResource.id
      
      // Reset form
      resourceForm.value = { uri: '', title: '', description: '', isPublished: false }
      
      // Navigate to detail
      router.push(`/resource/${resId}`)
    }
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.glass-card {
  backdrop-filter: blur(16px);
  background-color: rgba(12, 12, 12, 0.95) !important;
  border: 1px solid rgba(255, 255, 255, 0.08);
}
</style>
