<template>
  <v-sheet
    class="pa-2 rounded-xl glass-card d-flex align-center ga-1"
    elevation="4"
  >
    <v-btn v-for="tool in tools" :key="tool.icon" icon variant="text" size="small" @click="$emit('apply', tool.type)">
      <v-icon size="small">{{ tool.icon }}</v-icon>
      <v-tooltip activator="parent" location="bottom">{{ tool.label }}</v-tooltip>
    </v-btn>
    <v-divider vertical class="mx-2 opacity-10"></v-divider>
    <v-btn icon="mdi-link-plus" variant="text" size="small" @click="$emit('apply', 'wiki-link')" color="primary">
      <v-icon size="small">mdi-link-plus</v-icon>
      <v-tooltip activator="parent" location="bottom">Wiki Link [[...]]</v-tooltip>
    </v-btn>
    <v-btn icon="mdi-source-branch" variant="text" size="small" @click="$emit('apply', 'insert-children')">
      <v-icon size="small">mdi-source-branch</v-icon>
      <v-tooltip activator="parent" location="bottom">Insert Child Links</v-tooltip>
    </v-btn>
    <v-spacer></v-spacer>
    <slot name="append"></slot>
  </v-sheet>
</template>

<script setup lang="ts">
/**
 * MarkdownToolbar.vue
 *
 * Stateless formatting toolbar for markdown textareas.
 *
 * Renders a row of icon buttons (bold, italic, H1, H2, list, wiki-link,
 * insert-children) and emits an 'apply' event with a format-type string
 * when any button is clicked. The parent component is responsible for
 * consuming the event and delegating to `useMarkdownEditor.applyFormat()`.
 *
 * Design: intentionally dumb — no direct textarea access, no state.
 * This keeps the toolbar reusable across any editor surface.
 *
 * Slots:
 *   #append — additional controls placed after the built-in buttons (e.g.
 *              save/cancel actions in the wiki editor toolbar).
 *
 * Emits:
 *   apply(type: string) — format type, one of:
 *     'bold' | 'italic' | 'h1' | 'h2' | 'list' | 'wiki-link' | 'insert-children'
 */
const tools = [
  { icon: 'mdi-format-bold', label: 'Bold', type: 'bold' },
  { icon: 'mdi-format-italic', label: 'Italic', type: 'italic' },
  { icon: 'mdi-format-header-1', label: 'H1', type: 'h1' },
  { icon: 'mdi-format-header-2', label: 'H2', type: 'h2' },
  { icon: 'mdi-format-list-bulleted', label: 'List', type: 'list' }
]

defineEmits(['apply'])
</script>
