<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'

defineProps<{
  data: {
    name: string
    fields: {
      name: string
      type: string
      kind: string
      isId: boolean
    }[]
  }
}>()
</script>

<template>
  <div class="erd-node">
    <Handle type="target" :position="Position.Top" />
    <div class="node-header">{{ data.name }}</div>
    <div class="node-fields">
      <div v-for="field in data.fields" :key="field.name" class="field" :class="{ 'id-field': field.isId, 'relation-field': field.kind === 'object' }">
        <span class="field-name">{{ field.name }}</span>
        <span class="field-type">{{ field.type }}</span>
      </div>
    </div>
    <Handle type="source" :position="Position.Bottom" />
  </div>
</template>

<style scoped>
.erd-node {
  background: #1e1e2e;
  border: 1px solid #44475a;
  border-radius: 8px;
  min-width: 200px;
  color: #f8f8f2;
  font-family: 'Inter', sans-serif;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
}

.node-header {
  padding: 8px 12px;
  background: #6272a4;
  color: white;
  font-weight: bold;
  border-top-left-radius: 7px;
  border-top-right-radius: 7px;
  text-align: center;
}

.node-fields {
  padding: 8px;
}

.field {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  font-size: 13px;
  border-bottom: 1px solid #44475a;
}

.field:last-child {
  border-bottom: none;
}

.field-name {
  color: #50fa7b;
  margin-right: 12px;
}

.field-type {
  color: #bd93f9;
}

.id-field .field-name {
  color: #ffb86c;
  font-weight: bold;
}

.relation-field .field-type {
  color: #ff79c6;
  text-decoration: underline;
}
</style>
