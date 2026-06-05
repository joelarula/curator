<template>
  <v-container fluid class="pa-0 fill-height bg-detail">
    <v-row no-gutters class="fill-height overflow-hidden">
      <!-- Main Content: Identity & Texts -->
      <v-col cols="12" md="8" lg="9" class="d-flex flex-column h-100 border-e border-white border-opacity-5">
        <!-- High-Fidelity Header -->
        <v-toolbar flat color="transparent" class="px-8 pt-4 pb-2 border-b border-white border-opacity-5" height="auto">
          <div class="d-flex flex-column w-100 py-4">
            <div class="d-flex align-center mb-2">
              <v-btn icon="mdi-arrow-left" variant="text" size="small" @click="router.back()" class="me-4"></v-btn>
              <v-chip size="small" color="primary" variant="tonal" class="font-weight-black tracking-widest">
                {{ resource?.uri }}
              </v-chip>


              <v-spacer></v-spacer>
              <v-btn
                variant="tonal"
                icon="mdi-delete-outline"
                color="error"
                size="small"
                class="ms-2"
                @click="confirmDelete"
              ></v-btn>
            </div>
            
            <v-text-field
              v-model="resourceForm.title"
              placeholder="Untitled Resource"
              variant="plain"
              density="compact"
              class="title-editor text-h5 font-weight-black mb-2 animate-slide-in"
              hide-details
              @blur="saveResource"
              @keydown.enter="saveResource"
            ></v-text-field>

            
            <v-textarea
              v-model="resourceForm.description"
              placeholder="Add a high-fidelity description for this resource..."
              variant="plain"
              density="compact"
              rows="2"
              auto-grow
              class="description-editor opacity-60"
              hide-details
              @blur="saveResource"
            ></v-textarea>
          </div>
        </v-toolbar>

        <!-- Texts Section -->
        <div class="flex-grow-1 overflow-y-auto py-10 px-0 bg-content d-flex flex-column w-100">
          <v-toolbar flat color="transparent" class="mb-6 rounded-lg glass-card px-4">
            <div class="d-flex align-center w-100">
              <div class="d-flex align-center flex-grow-1 overflow-hidden">
                <v-tabs v-model="textTab" color="secondary" density="compact" class="flex-grow-0">
                  <v-tab v-for="text in resource?.texts" :key="text.id" :value="text.id" class="text-caption font-weight-black">
                    {{ text.role }}
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
          </v-window>

          <div v-if="!resource?.texts?.length" class="text-center py-16 opacity-20">
            <v-icon size="80" class="mb-4">mdi-text-box-plus-outline</v-icon>
            <div class="text-h6">No content established yet.</div>
            <v-btn variant="tonal" class="mt-4" rounded="pill" @click="addNewText">Create First Text</v-btn>
          </div>
        </div>
      </v-col>

      <!-- Right Sidebar: Relations Explorer -->
      <v-col cols="12" md="4" lg="3" class="d-flex flex-column h-100 bg-detail">
        <v-toolbar flat color="transparent" class="px-6 border-b border-white border-opacity-5">
          <v-toolbar-title class="text-overline font-weight-black tracking-widest opacity-40">
            Relations Graph
          </v-toolbar-title>
          <v-btn icon="mdi-plus" size="x-small" variant="tonal" color="primary" @click="showAddRelation = true"></v-btn>
        </v-toolbar>

        <div class="pa-6 flex-grow-1 overflow-y-auto">

          <v-divider class="mb-6 opacity-5"></v-divider>

          <!-- Triples Explorer -->
          <div class="d-flex ga-2 mb-4">
            <v-btn
              :variant="showSubjectRel ? 'flat' : 'tonal'"
              :color="showSubjectRel ? 'primary' : 'default'"
              size="small"
              rounded="pill"
              class="flex-grow-1 text-caption font-weight-black"
              prepend-icon="mdi-arrow-right-bold"
              :append-icon="showSubjectRel ? 'mdi-chevron-up' : 'mdi-chevron-down'"
              @click="showSubjectRel = !showSubjectRel"
            >
              Subject ({{ resource?.subjectRelations?.length || 0 }})
            </v-btn>
            <v-btn
              :variant="showObjectRel ? 'flat' : 'tonal'"
              :color="showObjectRel ? 'secondary' : 'default'"
              size="small"
              rounded="pill"
              class="flex-grow-1 text-caption font-weight-black"
              prepend-icon="mdi-arrow-left-bold"
              :append-icon="showObjectRel ? 'mdi-chevron-up' : 'mdi-chevron-down'"
              @click="showObjectRel = !showObjectRel"
            >
              Object ({{ resource?.objectRelations?.length || 0 }})
            </v-btn>

          </div>

          <v-expand-transition>
            <div v-if="showSubjectRel" class="mb-6 animate-fade-in">
              <div class="text-overline mb-3 opacity-30 px-2 tracking-widest">Outbound (Subject)</div>
              <div class="d-flex flex-column ga-2">
                <div v-for="rel in resource?.subjectRelations" :key="rel.id" class="rel-card pa-4 rounded-xl glass-card">
                  <div class="text-caption font-weight-black primary--text mb-1 tracking-widest uppercase opacity-60">{{ rel.predicate.uri }}</div>
                  <div class="text-body-2 font-weight-bold truncate">{{ rel.object.title || rel.object.uri }}</div>
                </div>
              </div>
            </div>
          </v-expand-transition>

          <v-expand-transition>
            <div v-if="showObjectRel" class="animate-fade-in">
              <div class="text-overline mb-3 opacity-30 px-2 tracking-widest">Inbound (Object)</div>
              <div class="d-flex flex-column ga-2">
                <div v-for="rel in resource?.objectRelations" :key="rel.id" class="rel-card pa-4 rounded-xl glass-card">
                   <div class="text-caption font-weight-black secondary--text mb-1 tracking-widest uppercase opacity-60">{{ rel.predicate.uri }}</div>
                   <div class="text-body-2 font-weight-bold truncate">{{ rel.subject.title || rel.subject.uri }}</div>
                </div>
              </div>
            </div>
          </v-expand-transition>

        </div>
      </v-col>
    </v-row>

    <!-- Overlay Dialogs -->
    <v-dialog v-model="showAddRelation" max-width="600">
      <v-card rounded="xl" class="pa-8 glass-card border-primary">
        <div class="d-flex align-center mb-6ga-2">
           <v-icon color="primary" class="me-2">mdi-rhombus-split</v-icon>
           <h3 class="text-h6 font-weight-black">Establish Semantic Relation</h3>
        </div>
        
        <v-row>
          <v-col cols="12">
            <v-autocomplete 
              v-model="relationForm.predicateUri" 
              v-model:search="uriSearch"
              :items="uriResults"
              item-title="uri"
              item-value="uri"
              label="Predicate URI" 
              placeholder="Start typing to search existing URIs..."
              variant="outlined" 
              rounded="lg" 
              hide-details
              class="glass-input"
              auto-select-first
            >
              <template v-slot:item="{ props, item }">
                <v-list-item v-bind="props" :title="item.raw.title" :subtitle="item.raw.uri"></v-list-item>
              </template>
            </v-autocomplete>
          </v-col>
          <v-col cols="12">
            <v-autocomplete 
              v-model="relationForm.objectUri" 
              v-model:search="uriSearch"
              :items="uriResults"
              item-title="uri"
              item-value="uri"
              label="Object URI (Optional)" 
              placeholder="Search existing or type new URI..."
              variant="outlined" 
              rounded="lg" 
              hide-details
              class="glass-input"
              auto-select-first
            >
              <template v-slot:item="{ props, item }">
                <v-list-item v-bind="props" :title="item.raw.title" :subtitle="item.raw.uri"></v-list-item>
              </template>
            </v-autocomplete>
          </v-col>

          <v-col cols="12" md="6">
            <v-text-field 
              v-model.number="relationForm.literalValue" 
              label="Literal Value" 
              type="number"
              variant="outlined" 
              rounded="lg" 
              hide-details
              class="glass-input"
            ></v-text-field>
          </v-col>
          <v-col cols="12">
            <v-textarea 
              v-model="relationForm.justification" 
              label="Justification / Evidence" 
              variant="outlined" 
              rounded="lg" 
              rows="3"
              hide-details
              class="glass-input"
            ></v-textarea>
          </v-col>
        </v-row>

        <v-card-actions class="px-0 pt-8">
          <v-spacer></v-spacer>
          <v-btn variant="text" rounded="pill" class="px-6" @click="showAddRelation = false">Cancel</v-btn>
          <v-btn 
            color="primary" 
            variant="flat" 
            rounded="pill" 
            class="px-8 font-weight-black" 
            @click="createRelation"
            :disabled="!relationForm.predicateUri"
          >
            Create Triple
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

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

  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { graphql, showSuccess, showError } from '../composables/useGraphql'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import ResourceTextEditor from '../components/ResourceTextEditor.vue'

const route = useRoute()
const router = useRouter()

const resource = ref<any>(null)
const resourceForm = ref({ title: '', description: '' })
const relationForm = ref({
  predicateUri: '',
  objectUri: '',
  literalValue: '' as string | number, // Freeform input
  justification: ''
})

const showAddRelation = ref(false)
const showAddTextDialog = ref(false)
const newTextRole = ref('MAIN')
const textRolesList = ref<string[]>(['MAIN', 'SUMMARY', 'TRANSCRIPT', 'HTML'])
const showSubjectRel = ref(true)
const showObjectRel = ref(false)
const textTab = ref<any>(null)
const viewMode = ref<'read' | 'edit'>('read')
const textDraft = ref('')
const savingText = ref(false)
const uriSearch = ref('')
const uriResults = ref<any[]>([])

const activeText = computed(() => {
  return resource.value?.texts?.find((t: any) => t.id === textTab.value) || null
})

async function searchUris(val: string) {
  if (!val || val.length < 2) return
  const data = await graphql(`
    query($search: String) {
      resources(search: $search, take: 10) {
        items { uri title }
      }
    }
  `, { search: val })
  uriResults.value = data?.resources?.items || []
}

watch(uriSearch, (val) => {
  searchUris(val)
})


async function createRelation() {
  if (!relationForm.value.predicateUri) return

  const rawLiteral = relationForm.value.literalValue
  const isNumeric = rawLiteral !== '' && !isNaN(Number(rawLiteral))

  await graphql(`
    mutation($input: JSON!) {
      upsertRelation(input: $input) { id }
    }
  `, {
    input: {
      subjectUri: resource.value.uri,
      predicateUri: relationForm.value.predicateUri,
      objectUri: relationForm.value.objectUri || 'type:literal',
      literalValue: isNumeric ? Number(rawLiteral) : null,
      literalString: !isNumeric ? String(rawLiteral) : null,
      justification: relationForm.value.justification
    }
  })

  showAddRelation.value = false
  relationForm.value = { predicateUri: '', objectUri: '', literalValue: '', justification: '' }
  showSuccess('Relation established')
  fetchResource()
}



onMounted(() => {
  fetchResource()
  fetchTextRoles()
})

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

async function fetchResource() {
  const data = await graphql(`
    query($id: Int!) {
      resource(id: $id) {
        id uri title description isPublished createdAt
        texts { id content role updatedAt }
        subjectRelations { id predicate { uri } object { id title uri } }
        objectRelations { id predicate { uri } subject { id title uri } }
        predicateRelations { id subject { id title uri } object { id title uri } }
      }
    }
  `, { id: parseInt(route.params.id as string) })

  if (data?.resource) {
    resource.value = data.resource
    resourceForm.value.title = data.resource.title || ''
    resourceForm.value.description = data.resource.description || ''
    if (resource.value.texts?.length) {
      if (!resource.value.texts.some((t: any) => t.id === textTab.value)) {
        textTab.value = resource.value.texts[0].id
      }
    } else {
      textTab.value = null
    }
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

async function saveResource() {
  await graphql(`
    mutation($input: ResourceInput!) {
      upsertResource(input: $input) { id }
    }
  `, {
    input: {
      id: parseInt(resource.value.id),
      uri: resource.value.uri,
      title: resourceForm.value.title,
      description: resourceForm.value.description
    }
  })
  showSuccess('Metadata updated')
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
  
  // Check if role already exists
  if (resource.value.texts?.some((t: any) => t.role === cleanRole)) {
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
    resourceId: parseInt(resource.value.id),
    content: "",
    role: cleanRole
  });

  if (data?.createText) {
    showSuccess(`Created text section ${cleanRole}`);
    await fetchResource();
    await fetchTextRoles();
    textTab.value = data.createText.id;
    viewMode.value = 'edit';
    showAddTextDialog.value = false;
  }
}

async function deleteCurrentText() {
  const activeText = resource.value.texts?.find((t: any) => t.id === textTab.value);
  if (!activeText) return;
  
  if (!window.confirm(`Are you sure you want to delete the text section "${activeText.role}"?`)) {
    return;
  }

  const data = await graphql(`
    mutation($id: ID!) {
      deleteText(id: $id)
    }
  `, { id: activeText.id });

  if (data) {
    showSuccess(`Deleted text section ${activeText.role}`);
    await fetchResource();
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

async function confirmDelete() {
  if (!window.confirm("Are you sure you want to delete this resource and all its relationships?")) {
    return;
  }
  const data = await graphql(`
    mutation($id: Int!) {
      deleteResource(id: $id)
    }
  `, { id: parseInt(resource.value.id) });
  if (data) {
    showSuccess("Resource deleted");
    router.push('/');
  }
}

function formatDate(val: string) {
  if (!val) return ''
  const date = isNaN(Number(val)) ? new Date(val) : new Date(Number(val))
  return date.toLocaleString('et-EE')
}
</script>

<style scoped>
.bg-detail {
  background-color: #080808;
}

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

.mini-tabs :deep(.v-tab) {
  font-size: 0.75rem !important;
  min-width: 0 !important;
  padding: 0 8px !important;
}

.rel-card {
  background: rgba(255, 255, 255, 0.02);
  transition: all 0.2s ease;
}

.rel-card:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(var(--v-theme-primary), 0.3) !important;
}

.truncate {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.description-input :deep(textarea) {
  font-size: 0.9rem;
  line-height: 1.5;
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

.animate-fade-in {
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}

:deep(.wiki-link) {
  color: var(--v-theme-primary);
  text-decoration: none;
  font-weight: 600;
  border-bottom: 1px dashed rgba(var(--v-theme-primary), 0.4);
}

.title-editor :deep(input) {
  color: #fff !important;
  font-weight: 900 !important;
}

:deep(.v-window__container) {
  width: 100%;
}

:deep(.v-window-item) {
  width: 100%;
}
</style>

