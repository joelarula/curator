<template>
  <v-row class="pa-4">
    <!-- Outbound Column -->
    <v-col cols="12" md="6" class="border-e border-white border-opacity-5 pr-6">
      <div class="d-flex align-center mb-6">
        <v-icon color="primary" class="me-2">mdi-arrow-right-bold</v-icon>
        <span class="text-h6 font-weight-black">Outbound (Subject)</span>
      </div>

      <!-- Outbound list -->
      <div class="d-flex flex-column ga-3 mb-6">
        <div v-for="rel in resource?.subjectRelations" :key="rel.id" class="pa-4 rounded-xl border border-white border-opacity-5 glass-card position-relative relation-item">
          <div class="text-caption font-weight-black text-primary mb-1 tracking-widest uppercase opacity-60">
            {{ rel.predicate.uri }}
          </div>
          <div class="text-body-2 font-weight-bold truncate mb-1">
            {{ rel.object.title || rel.object.uri }}
          </div>
          <div v-if="rel.literalValue !== null" class="text-caption text-grey">
            Value: {{ rel.literalValue }}
          </div>
          <div v-if="rel.justification" class="text-caption text-grey italic truncate" :title="rel.justification">
            "{{ rel.justification }}"
          </div>
          <v-btn
            icon="mdi-delete-outline"
            variant="text"
            color="error"
            size="small"
            class="position-absolute delete-btn"
            style="right: 8px; top: 8px;"
            @click="removeRelation(rel.id)"
          ></v-btn>
        </div>

        <div v-if="!resource?.subjectRelations?.length" class="text-center py-6 opacity-30 text-body-2">
          No outbound relations established.
        </div>
      </div>

      <!-- Add Outbound form -->
      <v-card variant="outlined" class="pa-4 border-dashed rounded-xl">
        <div class="text-subtitle-2 font-weight-bold mb-4">Add Outbound Triple</div>
        <v-row class="ga-3" no-gutters>
          <v-autocomplete
            v-model="outboundForm.predicateUri"
            v-model:search="predicateSearch"
            :items="predicateResults"
            item-title="uri"
            item-value="uri"
            label="Predicate URI"
            placeholder="Search predicates..."
            variant="outlined"
            rounded="lg"
            density="compact"
            hide-details
            class="w-100"
          >
            <template v-slot:item="{ props, item }">
              <v-list-item v-bind="props" :title="item.raw.title" :subtitle="item.raw.uri"></v-list-item>
            </template>
          </v-autocomplete>

          <v-autocomplete
            v-model="outboundForm.objectUri"
            v-model:search="uriSearch"
            :items="uriResults"
            item-title="uri"
            item-value="uri"
            label="Object URI"
            placeholder="Search resources..."
            variant="outlined"
            rounded="lg"
            density="compact"
            hide-details
            class="w-100"
          >
            <template v-slot:item="{ props, item }">
              <v-list-item v-bind="props" :title="item.raw.title" :subtitle="item.raw.uri"></v-list-item>
            </template>
          </v-autocomplete>

          <v-text-field
            v-model.number="outboundForm.literalValue"
            label="Literal Value (Optional)"
            variant="outlined"
            rounded="lg"
            density="compact"
            hide-details
            class="w-100"
          ></v-text-field>

          <v-text-field
            v-model="outboundForm.justification"
            label="Justification (Optional)"
            variant="outlined"
            rounded="lg"
            density="compact"
            hide-details
            class="w-100"
          ></v-text-field>

          <v-btn
            color="primary"
            variant="flat"
            rounded="pill"
            block
            class="mt-4 font-weight-bold"
            :disabled="!outboundForm.predicateUri || !outboundForm.objectUri"
            @click="createOutboundRelation"
          >
            Establish Outbound
          </v-btn>
        </v-row>
      </v-card>
    </v-col>

    <!-- Inbound Column -->
    <v-col cols="12" md="6" class="pl-6">
      <div class="d-flex align-center mb-6">
        <v-icon color="secondary" class="me-2">mdi-arrow-left-bold</v-icon>
        <span class="text-h6 font-weight-black">Inbound (Object)</span>
      </div>

      <!-- Inbound list -->
      <div class="d-flex flex-column ga-3 mb-6">
        <div v-for="rel in resource?.objectRelations" :key="rel.id" class="pa-4 rounded-xl border border-white border-opacity-5 glass-card position-relative relation-item">
          <div class="text-caption font-weight-black text-secondary mb-1 tracking-widest uppercase opacity-60">
            {{ rel.predicate.uri }}
          </div>
          <div class="text-body-2 font-weight-bold truncate mb-1">
            {{ rel.subject.title || rel.subject.uri }}
          </div>
          <div v-if="rel.justification" class="text-caption text-grey italic truncate" :title="rel.justification">
            "{{ rel.justification }}"
          </div>
          <v-btn
            icon="mdi-delete-outline"
            variant="text"
            color="error"
            size="small"
            class="position-absolute delete-btn"
            style="right: 8px; top: 8px;"
            @click="removeRelation(rel.id)"
          ></v-btn>
        </div>

        <div v-if="!resource?.objectRelations?.length" class="text-center py-6 opacity-30 text-body-2">
          No inbound relations established.
        </div>
      </div>

      <!-- Add Inbound form -->
      <v-card variant="outlined" class="pa-4 border-dashed rounded-xl">
        <div class="text-subtitle-2 font-weight-bold mb-4">Add Inbound Triple</div>
        <v-row class="ga-3" no-gutters>
          <v-autocomplete
            v-model="inboundForm.subjectUri"
            v-model:search="uriSearch"
            :items="uriResults"
            item-title="uri"
            item-value="uri"
            label="Subject URI"
            placeholder="Search resources..."
            variant="outlined"
            rounded="lg"
            density="compact"
            hide-details
            class="w-100"
          >
            <template v-slot:item="{ props, item }">
              <v-list-item v-bind="props" :title="item.raw.title" :subtitle="item.raw.uri"></v-list-item>
            </template>
          </v-autocomplete>

          <v-autocomplete
            v-model="inboundForm.predicateUri"
            v-model:search="predicateSearch"
            :items="predicateResults"
            item-title="uri"
            item-value="uri"
            label="Predicate URI"
            placeholder="Search predicates..."
            variant="outlined"
            rounded="lg"
            density="compact"
            hide-details
            class="w-100"
          >
            <template v-slot:item="{ props, item }">
              <v-list-item v-bind="props" :title="item.raw.title" :subtitle="item.raw.uri"></v-list-item>
            </template>
          </v-autocomplete>

          <v-text-field
            v-model="inboundForm.justification"
            label="Justification (Optional)"
            variant="outlined"
            rounded="lg"
            density="compact"
            hide-details
            class="w-100"
          ></v-text-field>

          <v-btn
            color="secondary"
            variant="flat"
            rounded="pill"
            block
            class="mt-4 font-weight-bold"
            :disabled="!inboundForm.subjectUri || !inboundForm.predicateUri"
            @click="createInboundRelation"
          >
            Establish Inbound
          </v-btn>
        </v-row>
      </v-card>
    </v-col>
  </v-row>
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

const outboundForm = ref({
  predicateUri: '',
  objectUri: '',
  literalValue: '' as string | number,
  justification: ''
})

const inboundForm = ref({
  subjectUri: '',
  predicateUri: '',
  justification: ''
})

const uriSearch = ref('')
const uriResults = ref<any[]>([])
const predicateSearch = ref('')
const predicateResults = ref<any[]>([])

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

async function searchPredicates(val: string) {
  if (!val || val.length < 2) return
  const data = await graphql(`
    query($search: String) {
      queryResources(filter: { search: $search, isPredicate: true }, take: 10) {
        items { uri title }
      }
    }
  `, { search: val })
  predicateResults.value = data?.queryResources?.items || []
}

watch(uriSearch, (val) => {
  searchUris(val)
})

watch(predicateSearch, (val) => {
  searchPredicates(val)
})

async function createOutboundRelation() {
  if (!outboundForm.value.predicateUri || !outboundForm.value.objectUri) return
  
  const rawLiteral = outboundForm.value.literalValue
  const isNumeric = rawLiteral !== '' && !isNaN(Number(rawLiteral))

  await graphql(`
    mutation($input: JSON!) {
      upsertRelation(input: $input) { id }
    }
  `, {
    input: {
      subjectUri: props.resource.uri,
      predicateUri: outboundForm.value.predicateUri,
      objectUri: outboundForm.value.objectUri,
      literalValue: isNumeric ? Number(rawLiteral) : null,
      literalString: !isNumeric ? String(rawLiteral) : null,
      justification: outboundForm.value.justification
    }
  })

  outboundForm.value = { predicateUri: '', objectUri: '', literalValue: '', justification: '' }
  showSuccess('Outbound relation established')
  emit('change')
}

async function createInboundRelation() {
  if (!inboundForm.value.subjectUri || !inboundForm.value.predicateUri) return

  await graphql(`
    mutation($input: JSON!) {
      upsertRelation(input: $input) { id }
    }
  `, {
    input: {
      subjectUri: inboundForm.value.subjectUri,
      predicateUri: inboundForm.value.predicateUri,
      objectUri: props.resource.uri,
      justification: inboundForm.value.justification
    }
  })

  inboundForm.value = { subjectUri: '', predicateUri: '', justification: '' }
  showSuccess('Inbound relation established')
  emit('change')
}

async function removeRelation(id: number) {
  if (!window.confirm("Are you sure you want to delete this relationship?")) {
    return
  }
  
  await graphql(`
    mutation($id: ID!) {
      deleteRelation(id: $id)
    }
  `, { id })

  showSuccess('Relation deleted')
  emit('change')
}
</script>

<style scoped>
.glass-card {
  background: rgba(255, 255, 255, 0.02) !important;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.relation-item .delete-btn {
  opacity: 0.1;
  transition: opacity 0.2s ease;
}

.relation-item:hover .delete-btn {
  opacity: 1;
}

.truncate {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
