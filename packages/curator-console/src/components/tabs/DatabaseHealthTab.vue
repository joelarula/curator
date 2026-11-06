<template>
  <div>
    <div class="d-flex align-center justify-space-between mb-4 flex-wrap ga-2">
      <div>
        <h3 class="text-subtitle-1 font-weight-bold">Curator Storage &amp; Database Health</h3>
        <div class="text-caption text-medium-emphasis">
          Queried via <code>query { curatorDatabaseHealth { storageEngine tables { name rowCount } requestsTotal } }</code>
        </div>
      </div>
      <div class="d-flex ga-2">
        <v-btn
          size="small"
          variant="tonal"
          prepend-icon="mdi-refresh"
          @click="$emit('refresh')"
        >
          Refresh
        </v-btn>
        <v-btn
          size="small"
          variant="tonal"
          color="primary"
          prepend-icon="mdi-download"
          @click="handleExportDb"
        >
          Export SQLite DB
        </v-btn>
        <v-btn
          size="small"
          variant="tonal"
          prepend-icon="mdi-upload"
          @click="triggerFileInput"
        >
          Import SQLite DB
        </v-btn>
        <input
          ref="dbFileInputRef"
          type="file"
          accept=".sqlite,.sqlite3,.db"
          style="display: none"
          @change="handleDbFileSelected"
        />
        <v-btn
          size="small"
          variant="text"
          color="error"
          prepend-icon="mdi-trash-can-outline"
          @click="handleResetDb"
        >
          Reset DB
        </v-btn>
      </div>
    </div>

    <!-- Metrics Cards -->
    <v-row class="mb-4">
      <v-col cols="6" sm="3">
        <v-card variant="outlined" rounded="lg" class="pa-3 text-center">
          <div class="text-h5 font-weight-bold text-primary">{{ dbHealth?.requestsTotal ?? 0 }}</div>
          <div class="text-caption text-medium-emphasis">Total Requests</div>
        </v-card>
      </v-col>
      <v-col cols="6" sm="3">
        <v-card variant="outlined" rounded="lg" class="pa-3 text-center">
          <div class="text-h5 font-weight-bold text-success">{{ dbHealth?.requestsCompleted ?? 0 }}</div>
          <div class="text-caption text-medium-emphasis">Completed</div>
        </v-card>
      </v-col>
      <v-col cols="6" sm="3">
        <v-card variant="outlined" rounded="lg" class="pa-3 text-center">
          <div class="text-h5 font-weight-bold text-error">{{ dbHealth?.requestsFailed ?? 0 }}</div>
          <div class="text-caption text-medium-emphasis">Failed</div>
        </v-card>
      </v-col>
      <v-col cols="6" sm="3">
        <v-card variant="outlined" rounded="lg" class="pa-3 text-center">
          <div class="text-h5 font-weight-bold text-info">{{ dbHealth?.requestsPending ?? 0 }}</div>
          <div class="text-caption text-medium-emphasis">Pending / Running</div>
        </v-card>
      </v-col>
    </v-row>

    <!-- Storage Engine Badge -->
    <div v-if="dbHealth?.storageEngine" class="mb-3 d-flex align-center ga-2">
      <span class="text-caption text-medium-emphasis">Storage Engine:</span>
      <v-chip size="x-small" color="primary" variant="outlined" class="font-monospace">
        {{ dbHealth.storageEngine }}
      </v-chip>
    </div>

    <!-- Tables Row Count -->
    <h4 class="text-subtitle-2 font-weight-bold mb-2">Entity Tables Row Counts</h4>
    <v-table density="compact" class="border rounded-lg mb-4">
      <thead>
        <tr>
          <th class="text-left font-weight-bold">Table Name</th>
          <th class="text-right font-weight-bold">Row Count</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="table in dbHealth?.tables || []" :key="table.name">
          <td><code class="font-monospace">{{ table.name }}</code></td>
          <td class="text-right font-monospace">{{ table.rowCount }}</td>
        </tr>
        <tr v-if="!dbHealth?.tables || dbHealth.tables.length === 0">
          <td colspan="2" class="text-center text-caption text-medium-emphasis py-4">
            No table metrics available.
          </td>
        </tr>
      </tbody>
    </v-table>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { DatabaseHealth, CuratorConsoleAdapter } from '../../types';

const props = defineProps<{
  dbHealth: DatabaseHealth | null;
  adapter?: CuratorConsoleAdapter;
}>();

const emit = defineEmits<{
  (e: 'refresh'): void;
}>();

const dbFileInputRef = ref<HTMLInputElement | null>(null);

function triggerFileInput() {
  dbFileInputRef.value?.click();
}

function handleExportDb() {
  if (props.adapter?.exportDatabase) {
    props.adapter.exportDatabase();
  } else {
    window.open('/api/curator/db/export', '_blank');
  }
}

async function handleDbFileSelected(e: Event) {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  try {
    if (props.adapter?.importDatabase) {
      await props.adapter.importDatabase(file);
      alert('Database imported successfully.');
      emit('refresh');
    } else {
      const res = await fetch('/api/curator/db/import', {
        method: 'POST',
        body: file,
      });
      if (res.ok) {
        alert('Database imported successfully.');
        emit('refresh');
      } else {
        alert('Database import failed.');
      }
    }
  } catch (err: any) {
    alert(`Database import error: ${err.message}`);
  } finally {
    if (target) target.value = '';
  }
}

async function handleResetDb() {
  if (!confirm('Are you sure you want to reset the database? This cannot be undone.')) return;
  try {
    if (props.adapter?.resetDatabase) {
      await props.adapter.resetDatabase();
    } else {
      await fetch('/api/curator/db/reset', { method: 'POST' });
    }
    emit('refresh');
  } catch (err: any) {
    alert(`Could not reset database: ${err.message}`);
  }
}
</script>

