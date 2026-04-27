<template>
  <v-dialog v-model="showEstablishSourceDialog" max-width="700">
    <v-card rounded="xl" class="pa-4 glass-card">
      <div class="pa-4 text-h5 font-weight-black uppercase tracking-tighter">Establish Source</div>
      <v-tabs v-model="createTab" color="primary" grow class="mb-4">
        <v-tab value="manual">Manual Entry</v-tab>
        <v-tab value="url">From URL</v-tab>
      </v-tabs>

      <v-window v-model="createTab" style="max-height: 70vh; overflow-y: auto;" class="pr-2 px-4">
        <v-window-item value="manual">
          <v-card-text class="pa-0 pt-4">
            <MarkdownToolbar @apply="applyManualFormat" class="mb-2" />
            <v-textarea
              ref="manualTextArea"
              v-model="newText.content"
              label="Text Content"
              variant="solo-filled"
              rows="12"
              placeholder="Paste the text or markdown to add..."
              auto-grow
            ></v-textarea>
            
            <v-row>
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="newText.source.title"
                  label="Display Title"
                  variant="solo-filled"
                  class="mb-2"
                  hide-details
                  @update:model-value="autoSlugify"
                ></v-text-field>
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="newText.path"
                  label="Identity Path (Slug)"
                  variant="solo-filled"
                  prepend-inner-icon="mdi-identifier"
                  class="mb-2"
                  placeholder="e.g. physics-basics"
                  persistent-placeholder
                  hide-details
                ></v-text-field>
              </v-col>
            </v-row>

            <TextMetadataEditor v-model="newText" />
          </v-card-text>
        </v-window-item>

        <v-window-item value="url">
          <v-card-text class="pa-0 pt-4">
            <div class="text-body-2 mb-4 text-grey">
              Paste a URL to extract text from web sources.
            </div>
            <v-text-field
              v-model="newText.source.url"
              label="URL"
              variant="solo-filled"
              prepend-inner-icon="mdi-link-variant"
            ></v-text-field>
          </v-card-text>
        </v-window-item>
      </v-window>

      <v-card-actions class="mt-6 px-4">
        <v-spacer></v-spacer>
        <v-btn variant="text" @click="showEstablishSourceDialog = false">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          rounded="pill"
          class="px-8"
          :loading="loading"
          :disabled="!newText.content.trim() && !newText.source.url.trim()"
          @click="createText"
        >
          Establish Source
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
/**
 * EstablishSourceDialog.vue
 *
 * Global dialog for creating a new wiki Source + its first Text record.
 * Triggered from anywhere via `useGlobalActions.showEstablishSourceDialog`.
 *
 * Two creation modes (tabs):
 *   1. "Manual Entry" — User types/pastes markdown directly. Title auto-
 *      slugifies into the identity path field. Supports markdown toolbar
 *      (bold, italic, headings, wiki-links) and full TextMetadataEditor
 *      for language, parent, tags, and publish state.
 *   2. "From URL"    — User pastes an external URL. On submit, the server
 *      will associate the URL with the new Source as its origin.
 *
 * On success:
 *   - Calls `saveWikiPage` mutation (delegates to WikiService on the server)
 *   - Navigates the router to the newly created page's materializedPath
 *   - Emits 'created' for parent components that need to react (e.g. refresh a list)
 *
 * State flow:
 *   `initialParentId` (from useGlobalActions) → pre-fills `newText.parentId`
 *   so that clicking "+" inside a wiki tree node creates a child page.
 */
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { graphql, showSuccess } from '../composables/useGraphql'
import { showEstablishSourceDialog, initialParentId } from '../composables/useGlobalActions'
import TextMetadataEditor from './TextMetadataEditor.vue'
import MarkdownToolbar from './MarkdownToolbar.vue'
import { useMarkdownEditor } from '../composables/useMarkdownEditor'

const router = useRouter()
const emit = defineEmits(['created'])

const loading = ref(false)
const createTab = ref('manual')
const manualTextArea = ref<any>(null)

const newText = ref({
  content: '',
  language: 'et',
  isPublished: false,
  textParentId: null as string | null,
  parentId: null as string | null,
  path: '',
  source: { title: '', url: '', type: 'ARTICLE', description: '' },
  tags: [] as any[]
})

watch(showEstablishSourceDialog, (isOpen) => {
    if (isOpen) {
        newText.value.parentId = initialParentId.value
    }
})

const { applyFormat: applyManualFormat } = useMarkdownEditor(computed({
  get: () => newText.value.content,
  set: (val) => newText.value.content = val
}) as any, manualTextArea)

function autoSlugify(val: string) {
    if (!newText.value.path || newText.value.path === slugify(val.slice(0, -1))) {
        newText.value.path = slugify(val)
    }
}

function slugify(text: string) {
    return text.toString().toLowerCase().trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]+/g, '')
        .replace(/--+/g, '-')
}

async function createText() {
  if (!newText.value.content.trim() && !newText.value.source.url.trim()) return
  loading.value = true
  
  const finalPath = newText.value.path.trim() || undefined

  const data = await graphql(`
    mutation($input: WikiPageInput!) {
      saveWikiPage(input: $input) { 
          id 
          path 
          materializedPath 
          title 
      }
    }
  `, {
    input: {
      path: finalPath,
      title: newText.value.source.title.trim() || undefined,
      content: newText.value.content,
      language: newText.value.language,
      url: newText.value.source.url.trim() || undefined,
      isPublished: newText.value.isPublished,
      textParentId: newText.value.textParentId || undefined,
      tags: newText.value.tags.map((t: any) => ({ name: t.name, value: t.value }))
    }
  })

  if (data?.saveWikiPage) {
    showSuccess('Source established')
    showEstablishSourceDialog.value = false
    
    const targetPath = data.saveWikiPage.materializedPath || data.saveWikiPage.path
    
    // Reset form
    newText.value.content = ''
    newText.value.source.title = ''
    newText.value.source.url = ''
    newText.value.path = ''
    
    emit('created', data.saveWikiPage)
    
    // Navigate using the ACTUAL path returned by the server
    if (targetPath) {
      router.push('/wiki/' + targetPath)
    }
  }
  loading.value = false
}
</script>

<style scoped>
.glass-card {
  backdrop-filter: blur(16px);
  background-color: rgba(18, 18, 18, 0.9) !important;
  border: 1px solid rgba(255, 255, 255, 0.08);
}
</style>
