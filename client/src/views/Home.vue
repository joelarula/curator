
<template>
  <v-container fluid class="fill-height pa-0 chat-container">
    <!-- Message History Area -->
    <div class="messages-area pa-4" ref="messagesRef">
      <div v-if="history.length === 0 && !loading" class="empty-state text-center">
        <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-chat-processing-outline</v-icon>
        <h2 class="text-h5 text-medium-emphasis">Welcome to Curator Consultant</h2>
        <p class="text-body-1 text-medium-emphasis">
          {{ currentProject ? `Ask anything about "${currentProject.name}"` : 'Ask anything across all your projects' }}
        </p>
      </div>

      <div v-for="(msg, idx) in history" :key="idx" :class="['message-wrapper', msg.role]">
        <v-card :color="msg.role === 'user' ? 'primary' : 'surface-variant'" 
                :theme="msg.role === 'user' ? 'dark' : 'light'"
                elevation="2" 
                class="message-card py-2 px-3">
          <div class="message-content" v-html="formatMessage(msg.content)"></div>
          
          <!-- Sources Expansion -->
          <div v-if="msg.sources && msg.sources.length > 0" class="mt-2 text-caption">
            <v-expansion-panels variant="accordion">
              <v-expansion-panel bg-color="transparent" elevation="0">
                <v-expansion-panel-title class="pa-0 min-height-0">
                  <span class="text-caption font-weight-bold">View Sources ({{ msg.sources.length }})</span>
                </v-expansion-panel-title>
                <v-expansion-panel-text class="pa-0">
                  <div v-for="(source, sIdx) in msg.sources" :key="sIdx" class="source-item mb-2 pb-1 border-bottom">
                    <div class="font-weight-bold mb-1">Source {{ sIdx + 1 }} - Score: {{ source.score?.toFixed(3) }}</div>
                    <div class="source-text">{{ source.content }}</div>
                  </div>
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>
          </div>
        </v-card>
      </div>

      <v-fade-transition>
        <div v-if="loading" class="message-wrapper assistant">
          <v-card color="surface-variant" elevation="1" class="message-card py-3 px-4">
            <v-progress-circular indeterminate size="20" width="2" color="primary" class="mr-2"></v-progress-circular>
            <span class="text-body-2">Thinking...</span>
          </v-card>
        </div>
      </v-fade-transition>
    </div>

    <!-- Bottom Input Area -->
    <v-divider></v-divider>
    <div class="input-area pa-4 bg-surface">
      <v-row no-gutters align="center">
        <v-col cols="auto" v-if="currentProject">
          <v-tooltip text="Upload files to project">
            <template v-slot:activator="{ props }">
              <v-btn v-bind="props" icon="mdi-paperclip" variant="text" @click="triggerFileInput" :disabled="loading"></v-btn>
            </template>
          </v-tooltip>
          <input type="file" ref="fileInputRef" style="display: none" multiple @change="handleFileChange" />
        </v-col>
        <v-col>
          <v-textarea
            v-model="query"
            placeholder="Type your message..."
            auto-grow
            rows="1"
            max-rows="5"
            variant="solo-filled"
            flat
            hide-details
            @keydown.enter.prevent="sendMessage"
            :disabled="loading"
            class="chat-input"
          ></v-textarea>
        </v-col>
        <v-col cols="auto" class="pl-2">
          <v-btn 
            color="primary" 
            icon="mdi-send" 
            @click="sendMessage" 
            :disabled="!isValidMessage || loading"
            elevation="2"
          ></v-btn>
        </v-col>
      </v-row>
      
      <!-- Uploading Files Indicator -->
      <v-chip-group v-if="selectedFiles.length > 0" class="mt-2">
        <v-chip
          v-for="(f, i) in selectedFiles"
          :key="i"
          closable
          size="small"
          @click:close="removeFile(i)"
        >
          {{ f.name }}
        </v-chip>
      </v-chip-group>
    </div>
  </v-container>
</template>

<script setup lang="ts">
import { ref, toRefs, watch, nextTick, computed } from 'vue'
import { apolloClient } from '../apollo'
import gql from 'graphql-tag'

interface Props {
  user: any
  currentProject?: any
}

const props = defineProps<Props>()
const { user, currentProject } = toRefs(props)

const RAG_AGENT_QUERY = gql`
  query RagAgent($query: String!, $projectId: Int) {
    ragAgent(query: $query, projectId: $projectId) {
      answer
      sources {
        content
        score
        metadata {
          fileId
          projectId
        }
      }
    }
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

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  sources?: any[]
}

const query = ref('')
const history = ref<ChatMessage[]>([])
const loading = ref(false)
const selectedFiles = ref<File[]>([])
const messagesRef = ref<HTMLElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

const isValidMessage = computed(() => query.value.trim() || selectedFiles.value.length > 0)

async function sendMessage() {
  if (!isValidMessage.value || loading.value) return

  const userQuery = query.value.trim()
  const localFiles = [...selectedFiles.value]
  
  // Clear inputs immediately
  query.value = ''
  selectedFiles.value = []

  // Add user message to history
  history.value.push({
    role: 'user',
    content: userQuery || (localFiles.length > 0 ? `Uploaded ${localFiles.length} file(s)` : '')
  })
  
  scrollToBottom()
  loading.value = true

  try {
    if (localFiles.length > 0) {
      await handleUpload(localFiles, userQuery)
    } else {
      const { data } = await apolloClient.query({
        query: RAG_AGENT_QUERY,
        variables: { 
          query: userQuery,
          projectId: currentProject.value?.id 
        },
        fetchPolicy: 'network-only'
      })

      if (data?.ragAgent) {
        history.value.push({
          role: 'assistant',
          content: data.ragAgent.answer,
          sources: data.ragAgent.sources
        })
      }
    }
  } catch (err: any) {
    history.value.push({
      role: 'assistant',
      content: `Error: ${err.message}`
    })
  } finally {
    loading.value = false
    scrollToBottom()
  }
}

async function handleUpload(files: File[], description: string) {
  const fileInputs = await Promise.all(
    files.map(async (file) => {
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
      projectId: currentProject.value?.id,
      description: description || undefined,
      query: description || undefined
    }
  })

  if (data?.uploadFiles?.success) {
    history.value.push({
      role: 'assistant',
      content: data.uploadFiles.message,
      sources: data.uploadFiles.results
    })
  }
}

function triggerFileInput() {
  fileInputRef.value?.click()
}

function handleFileChange(e: Event) {
  const target = e.target as HTMLInputElement
  if (target.files) {
    selectedFiles.value = [...selectedFiles.value, ...Array.from(target.files)]
  }
}

function removeFile(index: number) {
  selectedFiles.value.splice(index, 1)
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
  })
}

function formatMessage(content: string) {
  // Simple line-break formatting, can be expanded to markdown
  return content.replace(/\n/g, '<br>')
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

<style scoped>
.chat-container {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 64px - 48px); /* App bar - Extension height */
}

.messages-area {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.message-wrapper {
  display: flex;
  width: 100%;
}

.message-wrapper.user {
  justify-content: flex-end;
}

.message-wrapper.assistant {
  justify-content: flex-start;
}

.message-card {
  max-width: 85%;
  border-radius: 12px;
}

.user .message-card {
  border-bottom-right-radius: 2px;
}

.assistant .message-card {
  border-bottom-left-radius: 2px;
}

.input-area {
  width: 100%;
  position: sticky;
  bottom: 0;
  z-index: 10;
}

.source-text {
  font-size: 0.8rem;
  font-family: monospace;
  background: rgba(0,0,0,0.05);
  padding: 4px;
  border-radius: 4px;
  max-height: 100px;
  overflow-y: auto;
}

.border-bottom {
  border-bottom: 1px solid rgba(0,0,0,0.1);
}

.min-height-0 {
  min-height: 32px !important;
}

.empty-state {
  margin-top: 10%;
}
</style>
