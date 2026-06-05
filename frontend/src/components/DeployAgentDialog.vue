<template>
  <v-dialog v-model="isOpen" max-width="500">
    <v-card rounded="xl" class="pa-6 glass-card border border-white border-opacity-10 bg-console">
      <h3 class="text-h5 font-weight-black mb-6">Deploy New Agent</h3>
      <v-text-field
        v-model="newAgentForm.name"
        label="Agent Name"
        variant="outlined"
        class="mb-4"
      ></v-text-field>
      <v-text-field
        v-model="newAgentForm.schedule"
        label="Schedule (e.g. 'every 1 hour')"
        variant="outlined"
        class="mb-4"
      ></v-text-field>
      <div class="text-caption opacity-50 mb-6">
        A new blank script will be created and attached to this agent.
      </div>
      <div class="d-flex justify-end ga-4">
        <v-btn variant="text" @click="close">Cancel</v-btn>
        <v-btn color="primary" @click="submitCreateAgent" :loading="creatingAgent">Deploy</v-btn>
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

const newAgentForm = ref({ name: '', schedule: 'every 1 hour' })
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
        body: 'const chain = ToolChain.start()\n  .toJSON();'
      }
    })

    if (data?.upsertAgentWithScript) {
      showSuccess('Agent deployed successfully')
      close()
      // Redirect to agents page and select it
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
  background: rgba(255, 255, 255, 0.05) !important;
  backdrop-filter: blur(10px);
}
.bg-console {
  background-color: #030303;
}
</style>
