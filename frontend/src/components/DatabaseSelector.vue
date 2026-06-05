<template>
  <v-menu v-model="menu" :close-on-content-click="false" location="bottom end">
    <template v-slot:activator="{ props }">
      <v-btn v-bind="props" variant="text" size="small" class="text-none mr-2">
        <v-icon left>mdi-database-outline</v-icon>
        <span class="ml-1">{{ activeDbName }}</span>
        <v-icon right>mdi-chevron-down</v-icon>
      </v-btn>
    </template>

    <v-card min-width="250" class="bg-surface">
      <v-list class="bg-transparent" density="compact">
        <v-list-item
          v-for="db in databases"
          :key="db.id"
          :active="db.id === activeId"
          @click="switchDb(db.id)"
        >
          <template v-slot:prepend>
            <v-icon :color="db.id === activeId ? 'primary' : 'grey'">mdi-database</v-icon>
          </template>
          <v-list-item-title>{{ db.name }}</v-list-item-title>
          <template v-slot:append v-if="db.id !== 'default'">
            <v-btn icon="mdi-delete" size="x-small" variant="text" color="error" @click.stop="deleteDb(db.id)" />
          </template>
        </v-list-item>
      </v-list>
      <v-divider></v-divider>
      <v-card-text class="pt-2 pb-2">
        <div v-if="!isCreating">
          <v-btn block variant="tonal" size="small" prepend-icon="mdi-plus" @click="isCreating = true">
            New Database
          </v-btn>
        </div>
        <div v-else class="d-flex align-center">
          <v-text-field
            v-model="newDbName"
            density="compact"
            variant="outlined"
            hide-details
            placeholder="Database name"
            autofocus
            @keyup.enter="createDb"
            @keyup.esc="isCreating = false; newDbName = ''"
          ></v-text-field>
          <v-btn icon="mdi-check" size="small" color="primary" variant="text" class="ml-1" @click="createDb" :disabled="!newDbName.trim()" />
          <v-btn icon="mdi-close" size="small" color="error" variant="text" @click="isCreating = false; newDbName = ''" />
        </div>
      </v-card-text>
    </v-card>
  </v-menu>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { graphql } from '../composables/useGraphql'

const menu = ref(false)
const isCreating = ref(false)
const newDbName = ref('')

const activeId = ref('default')
const databases = ref<{id: string, name: string}[]>([])

const activeDbName = computed(() => {
  const db = databases.value.find(d => d.id === activeId.value)
  return db ? db.name : 'Unknown Database'
})

const fetchDbInfo = async () => {
  try {
    const resp = await graphql(`query { dbRegistry { activeId databases { id name } } }`);
    if (resp?.dbRegistry) {
      activeId.value = resp.dbRegistry.activeId;
      databases.value = resp.dbRegistry.databases;
    }
  } catch (err) {
    console.error('Failed to fetch DB info:', err);
  }
}

const emit = defineEmits(['database-changed'])

const switchDb = async (id: string) => {
  if (id === activeId.value) {
    menu.value = false
    return
  }
  try {
    const resp = await graphql(`mutation($id: ID!) { switchDatabase(id: $id) }`, { id });
    if (resp?.switchDatabase) {
      await fetchDbInfo()
      menu.value = false
      emit('database-changed')
    } else {
      console.error('Failed to switch DB:', resp?.errors)
    }
  } catch (err) {
    console.error('Failed to switch DB:', err)
  }
}

const createDb = async () => {
  if (!newDbName.value.trim()) return
  try {
    const resp = await graphql(`mutation($name: String!) { createDatabase(name: $name) }`, { name: newDbName.value.trim() });
    if (resp?.createDatabase) {
      isCreating.value = false
      newDbName.value = ''
      await fetchDbInfo()
      emit('database-changed')
    } else {
      console.error('Failed to create DB:', resp?.errors)
    }
  } catch (err) {
    console.error('Failed to create DB:', err)
  }
}

const deleteDb = async (id: string) => {
  if (!confirm('Are you sure you want to delete this database?')) return
  try {
    const resp = await graphql(`mutation($id: ID!) { deleteDatabase(id: $id) }`, { id });
    if (resp?.deleteDatabase) {
      const wasActive = id === activeId.value
      await fetchDbInfo()
      if (wasActive) {
        emit('database-changed')
      }
    } else {
      console.error('Failed to delete DB:', resp?.errors)
    }
  } catch (err) {
    console.error('Failed to delete DB:', err)
  }
}

onMounted(() => {
  fetchDbInfo()
})
</script>
