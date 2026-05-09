<template>
  <v-menu>
    <template v-slot:activator="{ props }">
      <v-btn v-bind="props" variant="text" :disabled="!user">
        Projects
      </v-btn>
    </template>
    <v-list>
      <v-list-item @click="$emit('show-create')" prepend-icon="mdi-plus">
        <v-list-item-title>New Project...</v-list-item-title>
      </v-list-item>
      
      <v-list-item 
        v-if="projectsList.length > 0"
        prepend-icon="mdi-folder-open"
      >
        <v-list-item-title>Open Project</v-list-item-title>
        <v-menu activator="parent" location="end">
          <v-list>
            <v-list-item
              v-for="proj in projectsList"
              :key="proj.id"
              @click="$emit('select', proj)"
              :class="{ 'bg-primary': currentProject?.id === proj.id }"
            >
              <template v-slot:prepend>
                <v-icon v-if="currentProject?.id === proj.id">mdi-check</v-icon>
              </template>
              <v-list-item-title>{{ proj.name }}</v-list-item-title>
              <v-list-item-subtitle>{{ proj.fileCount }} files</v-list-item-subtitle>
            </v-list-item>
          </v-list>
        </v-menu>
      </v-list-item>

      <v-divider v-if="projectsList.length > 0" />

      <v-list-item 
        v-if="currentProject"
        @click="$emit('confirm-delete', currentProject)"
        prepend-icon="mdi-delete"
      >
        <v-list-item-title>Delete Current Project</v-list-item-title>
      </v-list-item>
    </v-list>
  </v-menu>
</template>

<script setup lang="ts">
defineProps<{
  user: any,
  projectsList: any[],
  currentProject: any
}>()
defineEmits(['show-create', 'select', 'confirm-delete'])
</script>
