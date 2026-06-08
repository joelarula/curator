<template>
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

    <!-- Overlay Dialogs -->
    <v-dialog v-model="showAddRelation" max-width="600">
      <v-card rounded="xl" class="pa-8 glass-card border-primary">
        <div class="d-flex align-center mb-6 ga-2">
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
              <template v-slot:item="{ props: itemProps, item }">
                <v-list-item v-bind="itemProps" :title="item.raw.title" :subtitle="item.raw.uri"></v-list-item>
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
              <template v-slot:item="{ props: itemProps, item }">
                <v-list-item v-bind="itemProps" :title="item.raw.title" :subtitle="item.raw.uri"></v-list-item>
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
  </v-col>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { graphql, showSuccess } from '../composables/useGraphql'

const props = defineProps<{
  resource: any
}>()

const emit = defineEmits<{
  (e: 'change'): void
}>()

const showAddRelation = ref(false)
const showSubjectRel = ref(true)
const showObjectRel = ref(false)

const relationForm = ref({
  predicateUri: '',
  objectUri: '',
  literalValue: '' as string | number,
  justification: ''
})

const uriSearch = ref('')
const uriResults = ref<any[]>([])

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
      subjectUri: props.resource.uri,
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
  emit('change')
}
</script>

<style scoped>
.bg-detail {
  background-color: #080808;
}

.glass-card {
  background: rgba(255, 255, 255, 0.02) !important;
  border: 1px solid rgba(255, 255, 255, 0.05);
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

.primary--text {
  color: var(--v-theme-primary);
}

.secondary--text {
  color: var(--v-theme-secondary);
}

.animate-fade-in {
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
