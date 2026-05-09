<template>
  <v-container fluid class="pa-0 fill-height bg-wiki">
    <!-- Main Content Area -->
    <v-row no-gutters class="fill-height overflow-hidden">
      <!-- Content Viewer/Editor -->
      <v-col :cols="showSidebar ? 9 : 12" class="content-col d-flex flex-column h-100">
        
        <!-- Premium Toolbar -->
        <v-toolbar flat color="transparent" class="px-8 border-b border-white border-opacity-5">
          <div class="d-flex align-center flex-grow-1">
            <v-btn v-if="source?.parent" icon="mdi-arrow-left" variant="text" size="small" :to="'/wiki/' + (source.parent.materializedPath || source.parent.path)" class="me-4" color="primary">
               <v-tooltip activator="parent" location="bottom">Back to {{ source.parent.title || 'Parent' }}</v-tooltip>
            </v-btn>
            <v-btn icon="mdi-home" variant="text" size="small" :to="'/'" class="me-2 opacity-50"></v-btn>
            <v-breadcrumbs :items="breadcrumbItems" class="px-0 py-0 text-caption font-weight-bold uppercase tracking-widest opacity-40">
              <template v-slot:divider>
                <v-icon size="x-small">mdi-chevron-right</v-icon>
              </template>
            </v-breadcrumbs>
          </div>
          <v-spacer></v-spacer>
          
          <v-btn-toggle
            v-model="viewMode"
            mandatory
            variant="tonal"
            rounded="pill"
            density="compact"
            class="me-4"
          >
            <v-btn value="read" prepend-icon="mdi-book-open-variant" class="px-6 text-caption">Reading</v-btn>
            <v-btn value="edit" prepend-icon="mdi-pencil" class="px-6 text-caption">Writing</v-btn>
          </v-btn-toggle>

        </v-toolbar>

        <!-- Dynamic Content Area -->
        <div class="flex-grow-1 overflow-y-auto scroll-smooth py-12 px-8" ref="scrollContainer">
          <div v-if="loading && !source" class="d-flex justify-center align-center h-100">
            <v-progress-circular indeterminate color="primary" size="64" width="4"></v-progress-circular>
          </div>

          <div v-else-if="source || viewMode === 'edit'">
            <!-- READING MODE -->
            <div v-if="viewMode === 'read'" class="reading-typography animate-fade-in mb-16">
              <h1 class="text-h2 academic-title mb-8">{{ source?.title || lastSegment }}</h1>
              <div 
                v-if="source?.texts?.[0]" 
                class="content-renderer"
                v-html="renderedContent"
              ></div>
              <div v-else class="text-center py-16 opacity-30 border border-dashed rounded-xl">
                <v-icon size="64">mdi-text-box-remove-outline</v-icon>
                <div class="text-h6 mt-4 font-weight-light">Vacuum detected. This identity has no content.</div>
                <v-btn variant="text" color="primary" class="mt-4" @click="viewMode = 'edit'">Begin Writing</v-btn>
              </div>
            </div>

            <!-- EDITING MODE -->
            <div v-else class="max-width-1000 mx-auto animate-slide-up">
              <!-- Editor Formatting Toolbar -->
              <MarkdownToolbar @apply="applyFormat" class="mb-6 sticky-top z-10">
                <template #append>
                  <v-select
                    v-model="editForm.language"
                    :items="['et', 'en']"
                    variant="plain"
                    density="compact"
                    hide-details
                    class="shrink-select pe-4"
                    prefix="LANG: "
                  ></v-select>
                </template>
              </MarkdownToolbar>

              <div class="editor-container rounded-xl overflow-hidden glass-card border-opacity-10 mb-6">
                <v-text-field
                  v-model="editForm.title"
                  variant="plain"
                  placeholder="Page Title"
                  class="academic-title-input px-8 pt-8"
                ></v-text-field>
                <v-textarea
                  ref="editorTextArea"
                  v-model="editForm.content"
                  variant="plain"
                  auto-grow
                  rows="15"
                  placeholder="The knowledge flows here..."
                  class="mono-editor px-8 pb-8 pt-4"
                  hide-details
                ></v-textarea>
              </div>

              <TextMetadataEditor v-model="editForm" class="pa-6 rounded-xl glass-card border-opacity-10 mb-8" />
              
              <div class="d-flex justify-end ga-4 mb-16">
                <v-btn variant="text" rounded="pill" @click="viewMode = 'read'" class="px-8">Cancel</v-btn>
                <v-btn
                  color="primary"
                  variant="flat"
                  rounded="pill"
                  size="large"
                  class="px-12 font-weight-black"
                  elevation="8"
                  :loading="saving"
                  @click="savePage"
                >
                  Save Text
                </v-btn>
              </div>
            </div>
          </div>

          <!-- 404 / Missing State -->
          <div v-else class="text-center py-16 mt-16 animate-fade-in">
            <v-icon size="128" color="primary" class="mb-8 opacity-10">mdi-map-marker-question-outline</v-icon>
            <h2 class="text-h3 font-weight-bold mb-4 opacity-50">Identity Unknown</h2>
            <p class="text-subtitle-1 text-grey mb-12">The path "<strong>{{ currentPath }}</strong>" is currently empty in the Knowledge Graph.</p>
            <v-btn color="primary" size="x-large" rounded="pill" elevation="12" class="px-12 font-weight-black" @click="viewMode = 'edit'">
              Claim this Path
            </v-btn>
          </div>
        </div>
      </v-col>

      <!-- Semantic Context Sidebar -->
      <v-col v-if="showSidebar" cols="3" class="sidebar-col border-s border-white border-opacity-5 d-flex flex-column h-100">
        <div class="pa-8 flex-grow-1 overflow-y-auto">
          <div v-if="source">
            <!-- Summary Info -->
            <div class="mb-10 text-center">
              <v-avatar :color="source.type === 'WIKI_PAGE' ? 'primary' : 'secondary'" variant="tonal" rounded="xl" size="80" class="mb-4">
                <v-icon size="40">{{ source.type === 'WIKI_PAGE' ? 'mdi-book-open-page-variant' : 'mdi-web' }}</v-icon>
              </v-avatar>
              <div class="text-caption font-weight-black opacity-30 uppercase tracking-widest">{{ source.type }}</div>
            </div>

            <!-- Tags Section -->
            <div class="mb-10">
              <h3 class="text-overline font-weight-black opacity-40 mb-4 d-flex align-center ga-2">
                Classification <v-icon size="14">mdi-tag-outline</v-icon>
              </h3>
              <div class="d-flex flex-wrap ga-2">
                <v-chip v-for="tag in source.tags" :key="tag.id" size="x-small" variant="tonal" color="primary">
                  {{ tag.name }}: {{ tag.value }}
                </v-chip>
                <div v-if="!source.tags?.length" class="text-caption opacity-20 italic">No semantic tags.</div>
              </div>
            </div>

            <!-- Semantic Relations (The true graph) -->
            <div class="mb-10">
              <h3 class="text-overline font-weight-black opacity-40 mb-4 d-flex align-center ga-2">
                Relations <v-icon size="14">mdi-graph-outline</v-icon>
              </h3>
              <v-list v-if="source.outboundRelations?.length" bg-color="transparent" class="pa-0">
                <v-list-item
                  v-for="rel in source.outboundRelations"
                  :key="rel.id"
                  rounded="lg"
                  class="mb-2 glass-card pa-3 border-opacity-5"
                  hover
                  @click="router.push('/wiki/' + (rel.toSource.materializedPath || rel.toSource.path))"
                >
                  <template v-slot:append>
                    <v-chip size="x-small" variant="text" class="opacity-30">{{ rel.role }}</v-chip>
                  </template>
                  <v-list-item-title class="text-caption font-weight-bold">
                    {{ rel.toSource.title || rel.toSource.path }}
                  </v-list-item-title>
                </v-list-item>
              </v-list>
              <div v-else class="text-caption opacity-20 italic">No established relations.</div>
            </div>
          </div>
        </div>

        <!-- Sticky AI Action Footer -->
        <v-sheet v-if="source" class="pa-6 border-t border-white border-opacity-5 bg-black" color="transparent">
          <v-btn block color="secondary" variant="flat" size="large" rounded="pill" class="font-weight-black" prepend-icon="mdi-sparkles">
            Analyze Knowledge
          </v-btn>
        </v-sheet>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
/**
 * WikiPage.vue  (/wiki/:path*)
 *
 * The core wiki reading and editing surface — the most complex page in the app.
 *
 * Route: accepts any depth path (e.g. `/wiki/science/ai/agents`).
 * Special path prefix: `/wiki/fragments/<textId>` loads a specific Text by ID
 * rather than by source path.
 *
 * Layout:
 *   - Left (9/12 cols): reading or editing area.
 *   - Right (3/12 cols): semantic context sidebar with tags and outbound relations.
 *
 * Modes (toggled by the Reading / Writing btn-toggle in the toolbar):
 *   READ — Renders the latest Text's content as sanitised HTML via `marked` +
 *           `DOMPurify` (loaded from CDN). Post-processes `[[wiki-links]]` into
 *           `<a class="wiki-link">` elements intercepted by a document click
 *           listener to use Vue Router instead of a full page reload.
 *   EDIT — Full editor: title field, markdown textarea (with MarkdownToolbar),
 *           and TextMetadataEditor for language/parent/tags/URL/publish.
 *           The `insert-children` toolbar action generates `[[links]]` for all
 *           direct children of the current source.
 *
 * State:
 *   `source`  — the Source record fetched from `wikiPage` query (null = 404).
 *   `editForm` — reactive form mirroring WikiPageInput, pre-filled from source.
 *   On 404: drops straight into EDIT mode so the user can "claim" the path.
 *
 * Save:
 *   Calls `saveWikiPage` mutation via WikiService. If the materializedPath
 *   changed (e.g. a rename), the router navigates to the new URL.
 *   After save, triggers `refreshWikiTree` (injected from WikiSidebar) to
 *   update the sidebar tree without a full reload.
 *
 * Breadcrumbs: derived from the current route path segments.
 */
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { graphql, showSuccess } from '../composables/useGraphql'
import TextMetadataEditor from '../components/TextMetadataEditor.vue'
import MarkdownToolbar from '../components/MarkdownToolbar.vue'
import { useMarkdownEditor } from '../composables/useMarkdownEditor'

const route = useRoute()
const router = useRouter()

const loading = ref(false)
const saving = ref(false)
const source = ref<any>(null)
const viewMode = ref<'read' | 'edit'>('read')
const showSidebar = ref(true)
const editorTextArea = ref<any>(null)

const currentPath = computed(() => {
  const path = route.params.path
  if (Array.isArray(path)) return path.join('/')
  return path || 'home'
})

const pathSegments = computed(() => currentPath.value.split('/').filter(s => s))
const lastSegment = computed(() => pathSegments.value[pathSegments.value.length - 1] || 'Home')
const breadcrumbItems = computed(() => {
  const items = [{ title: 'ROOT', disabled: false, to: '/wiki/home' }]
  let builtPath = ''
  pathSegments.value.forEach(seg => {
    builtPath += '/' + seg
    items.push({ title: seg.toUpperCase(), disabled: false, to: '/wiki' + builtPath })
  })
  return items
})

const editForm = ref({
  title: '',
  path: '',
  content: '',
  language: 'et',
  isPublished: false,
  textParentId: null as string | null,
  parentId: null as string | null,
  source: { url: '' },
  tags: [] as any[]
})

const { applyFormat: originalApplyFormat, insertText } = useMarkdownEditor(computed({
  get: () => editForm.value.content,
  set: (val) => editForm.value.content = val
}) as any, editorTextArea)

function applyFormat(type: string) {
  if (type === 'insert-children') {
    if (source.value?.children?.length) {
      const links = source.value.children.map((c: any) => `- [[${c.materializedPath || c.path}|${c.title || c.path}]]`).join('\n')
      insertText('\n\n### Sub-identities\n' + links + '\n')
    }
  } else {
    originalApplyFormat(type)
  }
}

const renderedContent = computed(() => {
  const content = source.value?.texts?.[0]?.content || ''
  if (!content) return ''
  
  // Use Globals from CDN
  const windowObj = (window as any)
  if (windowObj.marked && windowObj.DOMPurify) {
    const rawHtml = windowObj.marked.parse(content)
    const cleanHtml = windowObj.DOMPurify.sanitize(rawHtml)
    // Custom post-processing for Wiki [[Links]]
    return cleanHtml.replace(/\[\[(.*?)\]\]/g, (match: string, link: string) => {
       const [path, label] = link.split('|').map((s: string) => s.trim())
       return `<a href="/wiki/${path}" class="wiki-link" data-path="/wiki/${path}">${label || path}</a>`
    })
  }
  
  // Fallback if CDN failed
  return content.replace(/\n/g, '<br>')
})

async function fetchPage() {
  if (!currentPath.value) return
  
  loading.value = true
  
  // Handle Fragment loading by Text ID
  if (currentPath.value.startsWith('fragments/')) {
    const textId = currentPath.value.split('/')[1]
    const data = await graphql(`
      query($id: ID!) {
        text(id: $id) {
          id content language isPublished
          originSource { 
            id path title url description isPublished status tags { id name value } 
            ancestors { id path title materializedPath }
          }
          tags { id name value }
        }
      }
    `, { id: textId })

    if (data?.text) {
      // Mock a Source object for the fragment view
      source.value = {
        ...data.text.originSource,
        isPublished: data.text.isPublished,
        texts: [data.text],
        outboundRelations: []
      }
      editForm.value.title = source.value.title || ''
      editForm.value.content = data.text.content || ''
      editForm.value.language = data.text.language || 'et'
      editForm.value.isPublished = data.text.isPublished || false
      editForm.value.textParentId = null // Hierarchy is on Source
      editForm.value.source.url = source.value.url || ''
      editForm.value.tags = data.text.tags?.map((t: any) => ({ name: t.name, value: t.value })) || []
      viewMode.value = 'read'
    } else {
      source.value = null
      viewMode.value = 'read'
    }
    loading.value = false
    return
  }

  const data = await graphql(`
    query($path: String!) {
      wikiPage(path: $path) {
        id path title description url isPublished tags { id name value }
        parent { id path title materializedPath }
        ancestors { id path title materializedPath }
        children { id path title materializedPath }
        outboundRelations { id role toSource { id path title } }
        texts {
          id content language isPublished
          tags { id name value }
        }
      }
    }
  `, { path: currentPath.value })
  
  if (data?.wikiPage) {
    source.value = data.wikiPage
    editForm.value.title = source.value.title || ''
    editForm.value.path = source.value.path || ''
    editForm.value.content = source.value.texts?.[0]?.content || ''
    editForm.value.language = source.value.texts?.[0]?.language || 'et'
    editForm.value.isPublished = source.value.isPublished || false
    editForm.value.textParentId = null 
    editForm.value.parentId = source.value.parent?.id || null
    editForm.value.source.url = source.value.url || ''
    editForm.value.tags = source.value.texts?.[0]?.tags?.map((t: any) => ({ name: t.name, value: t.value })) || []
    viewMode.value = 'read'
  } else {
    source.value = null
    editForm.value = {
      title: '',
      path: lastSegment.value, // Pre-fill with the slug from the URL
      content: '',
      language: 'et',
      isPublished: false,
      textParentId: null,
      parentId: null,
      source: { url: '' },
      tags: []
    }
    viewMode.value = 'edit'
  }
  loading.value = false
}

async function savePage() {
  saving.value = true
  const data = await graphql(`
    mutation($input: WikiPageInput!) {
      saveWikiPage(input: $input) { id path materializedPath title parent { id path title } }
    }
  `, {
    input: {
      id: source.value?.id,
      path: editForm.value.path,
      title: editForm.value.title,
      content: editForm.value.content,
      language: editForm.value.language,
      url: editForm.value.source.url || undefined,
      isPublished: editForm.value.isPublished,
      textParentId: editForm.value.textParentId || undefined,
      parentId: editForm.value.parentId || undefined,
      tags: editForm.value.tags.map((t: any) => ({ name: t.name, value: t.value }))
    }
  })
  
  if (data?.saveWikiPage) {
    showSuccess('Knowledge graph updated')
    const newFullPath = data.saveWikiPage.materializedPath || data.saveWikiPage.path
    if (newFullPath && newFullPath !== currentPath.value) {
      router.push('/wiki/' + newFullPath)
    } else {
      await fetchPage()
    }
    viewMode.value = 'read'
  }
  saving.value = false
}

// Composables handle formatting logic


function navigateSource(id: string) {
  // Finding the path for a specific source ID if needed, 
  // or just navigate to a general text details if ID is known.
  // For now, provenance links stay within the Wiki system if they have sources.
}

onMounted(() => {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    if (target.classList.contains('wiki-link')) {
      e.preventDefault()
      const path = target.getAttribute('data-path')
      if (path) router.push(path)
    }
  })
  fetchPage()
})

watch(() => currentPath.value, fetchPage)
</script>

<style scoped>
.bg-wiki {
  background-color: #0d0d0d;
}

.content-col {
  height: 100vh;
}

.max-width-1000 {
  max-width: 1000px;
}

.sticky-top {
  position: sticky;
  top: 0;
}

.z-10 {
  z-index: 10;
}

.academic-title {
  font-family: 'Merriweather', 'Literata', 'Georgia', serif;
  font-weight: 500;
  color: #ECEFF1;
  letter-spacing: -0.01em;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  padding-bottom: 1.5rem;
}

.academic-title-input :deep(input) {
  font-family: 'Merriweather', 'Literata', 'Georgia', serif;
  font-weight: 500;
  font-size: 2.2rem !important;
  color: #ECEFF1 !important;
}

.content-renderer {
  font-family: 'Inter', 'system-ui', sans-serif;
  line-height: 1.8;
  font-size: 1.1rem;
  color: rgba(255, 255, 255, 0.7);
}

.mono-editor :deep(textarea) {
  font-family: 'Fira Code', monospace;
  font-size: 1rem;
  line-height: 1.6;
}

.glass-card {
  background: rgba(255, 255, 255, 0.02) !important;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.animate-fade-in {
  animation: fadeIn 0.8s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.editor-container {
  background: #0a0a0a;
  min-height: 60vh;
}

.shrink-select {
  max-width: 120px;
}

.provenance-node {
  position: relative;
  padding-left: 12px;
}

.node-line {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: rgba(255, 255, 255, 0.05);
}

.node-line::after {
  content: '';
  position: absolute;
  top: 20px;
  left: -3px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #607D8B;
  box-shadow: 0 0 10px rgba(96, 125, 139, 0.5);
}

.sidebar-col {
  background-color: #0d0d0d;
}

:deep(.wiki-link) {
  color: #90A4AE !important;
  text-decoration: none;
  font-weight: 600;
  border-bottom: 1px dashed rgba(144, 164, 174, 0.3);
  transition: all 0.2s;
}

:deep(.wiki-link:hover) {
  border-bottom-style: solid;
  border-bottom-color: #90A4AE;
  background: rgba(144, 164, 174, 0.05);
}

.content-renderer :deep(p) {
  margin-bottom: 1.5rem;
}

.content-renderer :deep(ul), .content-renderer :deep(ol) {
  margin-bottom: 1.5rem;
  padding-left: 1.5rem;
}
</style>
