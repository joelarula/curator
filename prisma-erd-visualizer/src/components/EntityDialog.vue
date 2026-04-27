<script setup lang="ts">
defineProps<{
  model: {
    name: string
    fields: {
      name: string
      type: string
      kind: string
      isId: boolean
    }[]
  } | null
  isOpen: boolean
}>()

const emit = defineEmits(['close'])
</script>

<template>
  <div v-if="isOpen && model" class="dialog-backdrop" @click.self="emit('close')">
    <div class="dialog-content">
      <div class="dialog-header">
        <h2>{{ model.name }}</h2>
        <button class="close-btn" @click="emit('close')">&times;</button>
      </div>
      <div class="dialog-body">
        <table class="fields-table">
          <thead>
            <tr>
              <th>Field</th>
              <th>Type</th>
              <th>Kind</th>
              <th>Special</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="field in model.fields" :key="field.name" :class="{ 'id-row': field.isId, 'relation-row': field.kind === 'object' }">
              <td class="field-name">{{ field.name }}</td>
              <td class="field-type">{{ field.type }}</td>
              <td class="field-kind">{{ field.kind }}</td>
              <td class="field-special">
                <span v-if="field.isId" class="badge id-badge">ID</span>
                <span v-if="field.kind === 'object'" class="badge relation-badge">Relation</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dialog-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.dialog-content {
  background: #282a36;
  width: 80%;
  max-width: 800px;
  max-height: 80vh;
  border-radius: 12px;
  border: 1px solid #44475a;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: #f8f8f2;
}

.dialog-header {
  padding: 16px 24px;
  background: #6272a4;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dialog-header h2 {
  margin: 0;
  font-size: 24px;
  color: white;
}

.close-btn {
  background: transparent;
  border: none;
  color: white;
  font-size: 32px;
  cursor: pointer;
  line-height: 1;
}

.dialog-body {
  padding: 24px;
  overflow-y: auto;
}

.fields-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

.fields-table th {
  padding: 12px;
  border-bottom: 2px solid #44475a;
  color: #bd93f9;
}

.fields-table td {
  padding: 12px;
  border-bottom: 1px solid #44475a;
}

.id-row {
  background: rgba(255, 184, 108, 0.05);
}

.relation-row {
  background: rgba(255, 121, 198, 0.05);
}

.field-name {
  color: #50fa7b;
  font-weight: 500;
}

.field-type {
  color: #bd93f9;
}

.badge {
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: bold;
  text-transform: uppercase;
}

.id-badge {
  background: #ffb86c;
  color: #282a36;
}

.relation-badge {
  background: #ff79c6;
  color: #282a36;
}
</style>
