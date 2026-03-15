<template>
  <div v-if="user">
    <v-chip class="mr-2">
      {{ user.name || user.email }}
    </v-chip>
    <v-btn @click="$emit('logout')" variant="outlined">Sign Out</v-btn>
  </div>
  <v-btn v-else @click="$emit('login')" variant="outlined">
    Sign In with Google
  </v-btn>
</template>

<script setup lang="ts">
defineProps<{
  user: any
}>()
defineEmits(['login', 'logout'])
</script>
