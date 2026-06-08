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

        <!-- Texts Section Component -->
        <ResourceTextsManager :resource="resource" @change="fetchResource" />
      </v-col>

      <!-- Right Sidebar Component -->
      <RelationsSidebar :resource="resource" @change="fetchResource" />
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { graphql, showSuccess } from '../composables/useGraphql'
import ResourceTextsManager from '../components/ResourceTextsManager.vue'
import RelationsSidebar from '../components/RelationsSidebar.vue'

const route = useRoute()
const router = useRouter()

const resource = ref<any>(null)
const resourceForm = ref({ title: '', description: '' })

onMounted(() => {
  fetchResource()
})

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
  }
}

async function saveResource() {
  const normalizeText = (value: string | null | undefined) => (value ?? '').trim()
  const nextTitle = normalizeText(resourceForm.value.title)
  const nextDescription = normalizeText(resourceForm.value.description)
  const currentTitle = normalizeText(resource.value?.title)
  const currentDescription = normalizeText(resource.value?.description)

  if (nextTitle === currentTitle && nextDescription === currentDescription) {
    return
  }

  await graphql(`
    mutation($input: ResourceInput!) {
      upsertResource(input: $input) { id }
    }
  `, {
    input: {
      id: parseInt(resource.value.id),
      uri: resource.value.uri,
      title: nextTitle,
      description: nextDescription
    }
  })

  resource.value.title = nextTitle
  resource.value.description = nextDescription
  showSuccess('Metadata updated')
}

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
</script>

<style scoped>
.bg-detail {
  background-color: #080808;
}

.title-editor :deep(input) {
  color: #fff !important;
  font-weight: 900 !important;
}
</style>

