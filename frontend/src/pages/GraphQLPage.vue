<template>
  <iframe
    :src="graphqlUrl"
    style="width: 100%; height: calc(100vh - 64px); border: none; background: #121212;"
  ></iframe>
</template>

<script setup lang="ts">
/**
 * GraphQLPage.vue  (/graphql)
 *
 * Developer tool: embeds the GraphiQL IDE in a full-height iframe.
 *
 * The iframe URL points to the server's /graphql playground endpoint and
 * automatically injects the current user's JWT as a `?token=` query param.
 * This allows the embedded GraphiQL to make authenticated queries without
 * requiring any extra login step.
 *
 * Only accessible via the router — not linked in the main nav by default.
 * Intended for development and schema exploration.
 */
import { computed } from 'vue'

const graphqlUrl = computed(() => {
  const token = localStorage.getItem('token')
  return token
    ? `http://localhost:4000/graphql?token=${token}`
    : 'http://localhost:4000/graphql'
})
</script>
