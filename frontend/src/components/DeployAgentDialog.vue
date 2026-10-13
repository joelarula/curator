<template>
  <v-dialog v-model="isOpen" max-width="580">
    <v-card rounded="xl" class="pa-6 glass-card border border-white border-opacity-10 bg-console">
      <div class="d-flex align-center mb-4">
        <v-avatar color="primary" variant="tonal" rounded="lg" size="40" class="me-3">
          <v-icon size="24">mdi-robot</v-icon>
        </v-avatar>
        <div>
          <h3 class="text-h6 font-weight-black">Deploy New Agent</h3>
          <div class="text-caption opacity-60">Provision agent identity, governance role, and scheduler</div>
        </div>
      </div>

      <v-text-field
        v-model="newAgentForm.name"
        label="Agent Name *"
        variant="outlined"
        density="comfortable"
        placeholder="e.g. news_analyzer"
        class="mb-3"
      ></v-text-field>

      <v-text-field
        v-model="newAgentForm.description"
        label="Description"
        variant="outlined"
        density="comfortable"
        placeholder="e.g. Scrapes feeds and extracts RDF entities"
        class="mb-3"
      ></v-text-field>

      <v-select
        v-model="newAgentForm.role"
        :items="availableRoles"
        label="Governance Role (Whitelist)"
        variant="outlined"
        density="comfortable"
        hint="All tool access is whitelist-based. The agent can only execute tools permitted by this role."
        persistent-hint
        class="mb-3"
      ></v-select>

      <v-textarea
        v-model="newAgentForm.systemPrompt"
        label="System Prompt / Identity Directive"
        variant="outlined"
        density="comfortable"
        rows="3"
        placeholder="e.g. You are an autonomous agent specialized in analyzing..."
        class="mb-3"
      ></v-textarea>

      <v-text-field
        v-model="newAgentForm.schedule"
        label="Schedule (e.g. 'every 1 hour')"
        variant="outlined"
        density="comfortable"
        class="mb-4"
      ></v-text-field>

      <div class="d-flex justify-end ga-3">
        <v-btn variant="text" @click="close">Cancel</v-btn>
        <v-btn color="primary" prepend-icon="mdi-plus" @click="submitCreateAgent" :loading="creatingAgent">Deploy Agent</v-btn>
      </div>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { graphql, showSuccess, showError } from '../composables/useGraphql'
import { isDeployAgentOpen } from '../composables/useGlobalActions'

const isOpen = isDeployAgentOpen
const router = useRouter()

const availableRoles = [
  'agent:reader',
  'agent:writer',
  'agent:operator',
  'agent:developer',
  'agent:admin'
]

const newAgentForm = ref({
  name: '',
  description: '',
  systemPrompt: '',
  role: 'agent:reader',
  schedule: 'every 1 hour'
})
const creatingAgent = ref(false)

function close() {
  isOpen.value = false
}

async function submitCreateAgent() {
  if (!newAgentForm.value.name) return showError('Agent name required')
  creatingAgent.value = true
  try {
    const scriptName = `${newAgentForm.value.name}_script`
    const data = await graphql(`
      mutation($input: UpsertAgentWithScriptInput!) {
        upsertAgentWithScript(input: $input) {
          id name
        }
      }
    `, {
      input: {
        agentName: newAgentForm.value.name,
        scriptName: scriptName,
        schedule: newAgentForm.value.schedule,
        description: newAgentForm.value.description || null,
        systemPrompt: newAgentForm.value.systemPrompt || null,
        roleNames: newAgentForm.value.role ? [newAgentForm.value.role] : ['agent:reader'],
        body: 'const chain = ToolChain.start()\n  .toJSON();'
      }
    })

    if (data?.upsertAgentWithScript) {
      showSuccess('Agent deployed successfully')
      close()
      router.push({ name: 'agent-detail', params: { id: data.upsertAgentWithScript.id } })
    }
  } catch (e: any) {
    showError(e.message)
  } finally {
    creatingAgent.value = false
  }
}
</script>

<style scoped>
.glass-card {
  background: rgba(20, 20, 25, 0.95) !important;
  backdrop-filter: blur(16px);
}
.bg-console {
  background-color: #0b0c10;
}
</style>
