<template>
  <div class="flex-grow-1 overflow-y-auto py-10 px-0 bg-content d-flex flex-column w-100 h-100">
    <v-toolbar flat color="transparent" class="mb-6 rounded-lg glass-card px-4">
      <div class="d-flex align-center w-100">
        <div class="d-flex align-center flex-grow-1 overflow-hidden">
          <v-tabs v-model="textTab" color="secondary" density="compact" class="flex-grow-0">
            <v-tab v-for="text in resource?.texts" :key="text.id" :value="text.id" class="text-caption font-weight-black">
              {{ text.role }}
            </v-tab>
            <v-tab value="relations" class="text-caption font-weight-black text-primary">
              <v-icon start size="16" class="me-1">mdi-rhombus-split</v-icon>
              Relations
            </v-tab>
          </v-tabs>
          <v-btn
            icon="mdi-plus"
            variant="text"
            size="small"
            class="ms-1"
            @click="addNewText"
            title="Add text section"
          ></v-btn>
        </div>

        <v-spacer></v-spacer>

        <v-btn-toggle
          v-model="viewMode"
          mandatory
          variant="tonal"
          rounded="pill"
          density="compact"
          :disabled="!activeText"
          @update:model-value="onTextModeChanged"
        >
          <v-btn value="read" size="small" class="px-4">Read</v-btn>
          <v-btn value="edit" size="small" class="px-4">Edit</v-btn>
        </v-btn-toggle>
      </div>
    </v-toolbar>

    <v-window v-model="textTab" class="flex-grow-1 w-100">
      <v-window-item v-for="text in resource?.texts" :key="text.id" :value="text.id" class="h-100 w-100">
        <ResourceTextEditor
          :mode="viewMode"
          :draft="textDraft"
          :rendered-html="renderMarkdown(text.content)"
          :saving="savingText"
          :can-delete="true"
          class="h-100 w-100"
          @update:draft="(val) => textDraft = val"
          @save="saveCurrentText"
          @cancel="cancelEditingText"
          @delete="deleteCurrentText"
        />
      </v-window-item>

      <!-- Relations Editor Panel -->
      <v-window-item value="relations" class="h-100 w-100 bg-content overflow-y-auto">
        <RelationEditor :resource="resource" @change="$emit('change')" />
      </v-window-item>
    </v-window>

    <div v-if="!resource?.texts?.length && textTab !== 'relations'" class="text-center py-16 opacity-20">
      <v-icon size="80" class="mb-4">mdi-text-box-plus-outline</v-icon>
      <div class="text-h6">No content established yet.</div>
      <v-btn variant="tonal" class="mt-4" rounded="pill" @click="addNewText">Create First Text</v-btn>
    </div>

    <!-- Add Text Dialog -->
    <v-dialog v-model="showAddTextDialog" max-width="500">
      <v-card rounded="xl" class="pa-8 glass-card border-primary">
        <div class="d-flex align-center mb-6">
           <v-icon color="primary" class="me-2">mdi-text-box-plus-outline</v-icon>
           <h3 class="text-h6 font-weight-black">Establish Text Section</h3>
        </div>
        
        <v-row>
          <v-col cols="12">
            <v-combobox 
              v-model="newTextRole" 
              :items="textRolesList"
              label="Select or Type Role Name" 
              variant="outlined" 
              rounded="lg" 
              hide-details
              class="glass-input"
              auto-select-first
            ></v-combobox>
          </v-col>
        </v-row>

        <v-card-actions class="px-0 pt-8">
          <v-spacer></v-spacer>
          <v-btn variant="text" rounded="pill" class="px-6" @click="showAddTextDialog = false">Cancel</v-btn>
          <v-btn 
            color="primary" 
            variant="flat" 
            rounded="pill" 
            class="px-8 font-weight-black" 
            @click="submitNewText"
            :disabled="!newTextRole"
          >
            Create Section
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue'
import { graphql, showSuccess, showError } from '../composables/useGraphql'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import ResourceTextEditor from './ResourceTextEditor.vue'
import RelationEditor from './RelationEditor.vue'

const props = defineProps<{
  resource: any
}>()

const emit = defineEmits<{
  (e: 'change'): void
}>()

const textTab = ref<any>(null)
const viewMode = ref<'read' | 'edit'>('read')
const textDraft = ref('')
const savingText = ref(false)
const showAddTextDialog = ref(false)
const newTextRole = ref('MAIN')
const textRolesList = ref<string[]>(['MAIN', 'SUMMARY', 'TRANSCRIPT', 'HTML'])

const activeText = computed(() => {
  return props.resource?.texts?.find((t: any) => t.id === textTab.value) || null
})

onMounted(() => {
  fetchTextRoles()
  initializeTab()
})

watch(() => props.resource, () => {
  initializeTab()
})

function initializeTab() {
  if (props.resource?.texts?.length) {
    if (!props.resource.texts.some((t: any) => t.id === textTab.value) && textTab.value !== 'relations') {
      textTab.value = props.resource.texts[0].id
    }
  } else if (textTab.value !== 'relations') {
    textTab.value = null
  }
}

async function fetchTextRoles() {
  const data = await graphql(`
    query {
      textRoles
    }
  `)
  if (data?.textRoles) {
    textRolesList.value = data.textRoles
  }
}

function renderMarkdown(content: string) {
  if (!content) return ''
  const rawHtml = marked.parse(content) as string
  const cleanHtml = DOMPurify.sanitize(rawHtml)
  // Custom post-processing for Wiki [[Links]]
  return cleanHtml.replace(/\[\[(.*?)\]\]/g, (match: string, link: string) => {
     const [path, label] = link.split('|').map((s: string) => s.trim())
     return `<a href="/wiki/${path}" class="wiki-link" data-path="/wiki/${path}">${label || path}</a>`
  })
}

function startEditingText() {
  if (!activeText.value) return
  textDraft.value = activeText.value.content || ''
  viewMode.value = 'edit'
}

function onTextModeChanged(mode: 'read' | 'edit') {
  if (mode === 'edit') {
    startEditingText()
    return
  }
  viewMode.value = 'read'
}

function cancelEditingText() {
  textDraft.value = activeText.value?.content || ''
  viewMode.value = 'read'
}

async function saveCurrentText() {
  if (!activeText.value) return
  savingText.value = true
  try {
    const data = await graphql(`
      mutation($id: ID!, $content: String!) {
        updateText(id: $id, content: $content) { id content }
      }
    `, { id: activeText.value.id, content: textDraft.value })

    if (data?.updateText) {
      activeText.value.content = textDraft.value
      showSuccess('Text content saved')
      viewMode.value = 'read'
      emit('change')
    }
  } finally {
    savingText.value = false
  }
}

function addNewText() {
  newTextRole.value = 'MAIN';
  showAddTextDialog.value = true;
}

async function submitNewText() {
  if (!newTextRole.value) return;
  const cleanRole = newTextRole.value.trim().toUpperCase();
  if (!cleanRole) return;
  
  if (props.resource.texts?.some((t: any) => t.role === cleanRole)) {
    showError(`Text with role ${cleanRole} already exists`);
    return;
  }

  const data = await graphql(`
    mutation($resourceId: Int!, $content: String!, $role: String!) {
      createText(resourceId: $resourceId, content: $content, role: $role) {
        id content role
      }
    }
  `, {
    resourceId: parseInt(props.resource.id),
    content: "",
    role: cleanRole
  });

  if (data?.createText) {
    showSuccess(`Created text section ${cleanRole}`);
    emit('change')
    textTab.value = data.createText.id;
    viewMode.value = 'edit';
    showAddTextDialog.value = false;
  }
}

async function deleteCurrentText() {
  const text = activeText.value
  if (!text) return;
  
  if (!window.confirm(`Are you sure you want to delete the text section "${text.role}"?`)) {
    return;
  }

  const data = await graphql(`
    mutation($id: ID!) {
      deleteText(id: $id)
    }
  `, { id: text.id });

  if (data) {
    showSuccess(`Deleted text section ${text.role}`);
    emit('change')
  }
}

watch([textTab, viewMode], () => {
  if (viewMode.value === 'edit' && activeText.value) {
    textDraft.value = activeText.value.content || ''
  }
})

watch(activeText, (text) => {
  if (!text && viewMode.value !== 'read') {
    viewMode.value = 'read'
  }
})
</script>

<style scoped>
.bg-content {
  background-color: #030303;
}

.glass-card {
  background: rgba(255, 255, 255, 0.02) !important;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.border-primary-light {
  border-left: 4px solid var(--v-theme-primary) !important;
}

.text-editor :deep(textarea) {
  font-family: 'Inter', sans-serif;
  font-size: 1.1rem;
  line-height: 1.8;
  color: rgba(255, 255, 255, 0.9) !important;
}

.reading-typography {
  letter-spacing: -0.01em;
}

.content-renderer {
  font-family: 'Inter', sans-serif;
  line-height: 1.8;
  font-size: 1.1rem;
  color: rgba(255, 255, 255, 0.8);
}

.content-renderer :deep(p) {
  margin-bottom: 1.5rem;
}

.content-renderer :deep(h1), .content-renderer :deep(h2), .content-renderer :deep(h3) {
  margin-top: 2rem;
  margin-bottom: 1rem;
  color: #fff;
}

:deep(.wiki-link) {
  color: var(--v-theme-primary);
  text-decoration: none;
  font-weight: 600;
  border-bottom: 1px dashed rgba(var(--v-theme-primary), 0.4);
}

:deep(.v-window__container) {
  width: 100%;
}

:deep(.v-window-item) {
  width: 100%;
}
</style>
