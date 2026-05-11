<template>
  <v-container fluid class="pa-0 fill-height bg-studio">
    <v-row no-gutters class="fill-height overflow-hidden">
      <!-- Left Panel: Script Editor -->
      <v-col cols="6" class="border-e border-white border-opacity-10 d-flex flex-column h-100">
        <v-toolbar flat color="transparent" class="px-6 border-b border-white border-opacity-5">
          <v-icon color="primary" class="me-3">mdi-code-braces</v-icon>
          <v-toolbar-title class="text-subtitle-1 font-weight-black tracking-widest uppercase">
            Script Editor
          </v-toolbar-title>

          <v-spacer></v-spacer>
          
          <v-btn
            variant="tonal"
            color="primary"
            rounded="pill"
            class="me-2 px-6"
            prepend-icon="mdi-content-save"
            :loading="saving"
            @click="saveScript"
          >
            Save Script
          </v-btn>
          
          <v-btn
            color="secondary"
            variant="flat"
            rounded="pill"
            class="px-8 font-weight-black"
            prepend-icon="mdi-play"
            :loading="executing"
            @click="runScript"
          >
            Execute
          </v-btn>
        </v-toolbar>

        <div class="pa-6 flex-grow-1 d-flex flex-column ga-6 overflow-y-auto">
          <!-- Metadata Fields -->
          <div class="d-flex ga-4">
            <v-text-field
              v-model="scriptForm.name"
              label="Script Name"
              variant="outlined"
              density="compact"
              hide-details
              class="flex-grow-1"
              placeholder="e.g. analyze_trends"
            ></v-text-field>
            <v-select
              v-model="mode"
              :items="['Dynamic (JS)', 'Static (JSON)']"
              label="Execution Mode"
              variant="outlined"
              density="compact"
              hide-details
              class="shrink-select"
            ></v-select>
          </div>

          <v-textarea
            v-model="scriptForm.prompt"
            label="System Prompt (Context)"
            variant="outlined"
            rows="3"
            auto-grow
            hide-details
            placeholder="High-level instructions for the agent..."
            class="prompt-area"
          ></v-textarea>

          <!-- Code Editor Area -->
          <div class="editor-wrapper flex-grow-1 rounded-xl overflow-hidden glass-card">
            <div class="editor-header px-4 py-2 d-flex align-center border-b border-white border-opacity-5">
              <span class="text-caption font-weight-bold opacity-40">{{ mode === 'Dynamic (JS)' ? 'script.body.js' : 'toolCalls.json' }}</span>
              <v-spacer></v-spacer>
              <v-btn icon="mdi-content-copy" variant="text" size="x-small" @click="copyCode"></v-btn>
            </div>
            <v-textarea
              v-model="code"
              variant="plain"
              class="mono-editor px-4 py-2 h-100"
              hide-details
              no-resize
              :placeholder="editorPlaceholder"
            ></v-textarea>
          </div>
        </div>
      </v-col>

      <!-- Right Panel: Results & Console -->
      <v-col cols="6" class="bg-console d-flex flex-column h-100">
        <v-toolbar flat color="transparent" class="px-6 border-b border-white border-opacity-5">
          <v-tabs v-model="activeTab" color="secondary" align-tabs="start">
            <v-tab value="output">Execution Output</v-tab>
            <v-tab value="raw">Raw Response</v-tab>
            <v-tab value="history">History</v-tab>
          </v-tabs>
        </v-toolbar>

        <v-window v-model="activeTab" class="flex-grow-1 overflow-y-auto">
          <v-window-item value="output" class="pa-6">
            <div v-if="!lastResponse && !executing" class="d-flex flex-column align-center justify-center py-16 opacity-20">
              <v-icon size="80" class="mb-4">mdi-terminal-prompt</v-icon>
              <div class="text-h6 font-weight-light">Awaiting initiation sequence...</div>
            </div>

            <div v-if="executing" class="d-flex flex-column ga-4 animate-pulse">
              <div v-for="i in 3" :key="i" class="skeleton-line rounded-pill"></div>
            </div>

            <div v-if="lastResponse" class="animate-fade-in">
              <!-- Success Status -->
              <div class="d-flex align-center mb-6 ga-4">
                <v-chip color="success" variant="flat" size="small" class="font-weight-black">COMPLETED</v-chip>
                <div class="text-caption opacity-40">Request ID: {{ lastResponse.id }}</div>
                <v-spacer></v-spacer>
                <div class="text-caption font-weight-bold secondary--text">{{ executionTime }}ms</div>
              </div>

              <!-- Visual Result Cards -->
              <div class="d-flex flex-column ga-4">
                <div v-for="resp in lastResponse.responses" :key="resp.id" class="result-card pa-6 rounded-xl glass-card">
                  <div class="d-flex align-center mb-4 ga-2">
                    <v-icon size="18" color="secondary">mdi-robot-outline</v-icon>
                    <span class="text-caption font-weight-black uppercase tracking-tighter opacity-50">AI Response</span>
                  </div>
                  <div class="result-content" v-html="formatContent(resp.content)"></div>
                </div>

                <div v-if="lastResponse.toolCalls" class="pa-4 rounded-xl border border-white border-opacity-5 bg-black">
                  <div class="text-overline mb-2 opacity-30">Plan Materialized</div>
                  <div class="tool-chain-flow">
                    <v-chip v-for="(call, i) in lastResponse.toolCalls" :key="i" size="x-small" variant="tonal" class="me-2 mb-2">
                      {{ call.name }}
                    </v-chip>
                  </div>
                </div>
              </div>
            </div>
          </v-window-item>

          <v-window-item value="raw" class="pa-0">
            <pre class="raw-json pa-6">{{ JSON.stringify(lastResponse, null, 2) }}</pre>
          </v-window-item>
        </v-window>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { graphql, showSuccess, showError } from '../composables/useGraphql'

const saving = ref(false)
const executing = ref(false)
const activeTab = ref('output')
const mode = ref('Dynamic (JS)')
const executionTime = ref(0)

const scriptForm = ref({
  name: '',
  prompt: '',
})

const code = ref('')
const lastResponse = ref<any>(null)

const editorPlaceholder = computed(() => 
  mode.value === 'Dynamic (JS)' 
    ? 'const chain = ToolChain.start()...' 
    : '[ { "name": "..." } ]'
)

const saveScript = async () => {
  if (!scriptForm.value.name) return showError('Script name is required')
  
  saving.value = true
  try {
    const isDynamic = mode.value === 'Dynamic (JS)'
    const data = await graphql(`
      mutation($name: String!, $prompt: String, $body: String, $toolCalls: JSON) {
        upsertScript(name: $name, prompt: $prompt, body: $body, toolCalls: $toolCalls) {
          id name
        }
      }
    `, {
      name: scriptForm.value.name,
      prompt: scriptForm.value.prompt,
      body: isDynamic ? code.value : null,
      toolCalls: !isDynamic ? JSON.parse(code.value || '[]') : null
    })

    if (data?.upsertScript) {
      showSuccess(`Script "${data.upsertScript.name}" saved`)
    }
  } catch (e: any) {
    showError(e.message)
  } finally {
    saving.value = false
  }
}

const runScript = async () => {
  executing.value = true
  const startTime = Date.now()
  try {
    const isDynamic = mode.value === 'Dynamic (JS)'
    
    // We use executeRequest to block until completion
    const data = await graphql(`
      mutation($body: String, $toolCalls: JSON, $prompt: String) {
        executeRequest(body: $body, toolCalls: $toolCalls, prompt: $prompt, timeoutMs: 60000) {
          id
          status
          toolCalls
          responses {
            id
            content
            createdAt
          }
        }
      }
    `, {
      body: isDynamic ? code.value : null,
      toolCalls: !isDynamic ? JSON.parse(code.value || '[]') : null,
      prompt: scriptForm.value.prompt
    })

    if (data?.executeRequest) {
      lastResponse.value = data.executeRequest
      activeTab.value = 'output'
      executionTime.value = Date.now() - startTime
    }
  } catch (e: any) {
    showError(e.message)
  } finally {
    executing.value = false
  }
}

const formatContent = (content: string) => {
  try {
    // Basic formatting for JSON results
    const parsed = JSON.parse(content)
    return `<pre class="json-content">${JSON.stringify(parsed, null, 2)}</pre>`
  } catch {
    return content.replace(/\n/g, '<br>')
  }
}

const copyCode = () => {
  navigator.clipboard.writeText(code.value)
  showSuccess('Code copied to clipboard')
}

onMounted(() => {
  // Pre-fill with a sample dynamic script
  code.value = `const chain = ToolChain.start()
  .scrape_resource({ url: "https://example.com" })
  .then("ask_llm", { 
    prompt: "Summarize this page content: {{scrape_resource.result}}" 
  })
  .toJSON();`
  
  scriptForm.value.name = 'new_workflow_' + Math.floor(Math.random() * 1000)
})
</script>

<style scoped>
.bg-studio {
  background-color: #080808;
}

.bg-console {
  background-color: #030303;
}

.glass-card {
  background: rgba(255, 255, 255, 0.02) !important;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.shrink-select {
  max-width: 180px;
}

.mono-editor :deep(textarea) {
  font-family: 'Fira Code', 'Roboto Mono', monospace;
  font-size: 0.95rem;
  line-height: 1.6;
  color: #80CBC4 !important; /* Tealish code color */
}

.prompt-area :deep(textarea) {
  font-size: 0.9rem;
  opacity: 0.7;
}

.raw-json {
  font-family: monospace;
  font-size: 0.8rem;
  color: #aaa;
  white-space: pre-wrap;
}

.result-content {
  font-size: 0.95rem;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.8);
}

:deep(.json-content) {
  background: rgba(0,0,0,0.3);
  padding: 12px;
  border-radius: 8px;
  overflow-x: auto;
  font-size: 0.85rem;
  color: #90A4AE;
}

.skeleton-line {
  height: 20px;
  background: rgba(255, 255, 255, 0.05);
  width: 100%;
}

.animate-pulse {
  animation: pulse 1.5s infinite ease-in-out;
}

@keyframes pulse {
  0% { opacity: 0.3; }
  50% { opacity: 0.6; }
  100% { opacity: 0.3; }
}

.animate-fade-in {
  animation: fadeIn 0.5s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.editor-wrapper {
  background: #0a0a0a;
}
</style>
