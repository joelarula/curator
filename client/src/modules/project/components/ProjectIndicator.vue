<template>
  <v-chip v-if="currentProject" size="small" variant="text" prepend-icon="mdi-folder">
    {{ currentProject.name }} ({{ currentProject.fileCount }} files)
  </v-chip>
  <v-chip v-else-if="user" size="small" variant="text" color="warning">
    No project selected
  </v-chip>
</template>

<script setup lang="ts">
defineProps<{
  user: any,
  currentProject: any
}>()
</script>
