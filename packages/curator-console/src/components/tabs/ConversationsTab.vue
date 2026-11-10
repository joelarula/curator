<template>
  <div class="conversations-tab">
    <div class="d-flex align-center ga-2 mb-3 flex-wrap">
      <span class="text-subtitle-2 font-weight-bold">{{ list.showArchived.value ? 'Archived conversations' : 'Conversations' }}</span>
      <v-text-field
        v-model="list.query.value"
        density="compact"
        variant="outlined"
        hide-details
        clearable
        placeholder="Search titles"
        prepend-inner-icon="mdi-magnify"
        style="max-width: 260px;"
        @keyup.enter="list.load()"
        @click:clear="clearSearch"
      />
      <v-btn size="small" variant="text" :prepend-icon="list.showArchived.value ? 'mdi-forum-outline' : 'mdi-archive-outline'" @click="list.toggleArchived()">
        {{ list.showArchived.value ? 'Show active' : 'Show archived' }}
      </v-btn>
      <v-btn size="small" variant="text" icon="mdi-refresh" class="ms-auto" :loading="list.loading.value" @click="list.load()" />
    </div>

    <v-alert v-if="!list.available.value" type="info" variant="tonal" density="compact">
      Organising conversations needs the <code>conversations:own</code> role.
    </v-alert>
    <v-alert v-if="list.error.value" type="error" variant="tonal" density="compact" class="mb-3" closable>
      {{ list.error.value }}
    </v-alert>

    <div v-if="list.available.value && !list.loading.value && list.conversations.value.length === 0" class="text-caption text-medium-emphasis py-4 text-center">
      {{ list.showArchived.value ? 'No archived conversations.' : 'No conversations yet.' }}
    </div>

    <v-list density="compact" class="py-0">
      <v-list-item
        v-for="c in list.conversations.value"
        :key="c.conversationId"
        :active="c.externalId === activeExternalId"
        rounded="md"
        class="mb-1 border"
        @click="open(c)"
      >
        <template #prepend>
          <v-icon size="18" :color="c.pinned ? 'primary' : undefined">{{ c.pinned ? 'mdi-pin' : 'mdi-message-outline' }}</v-icon>
        </template>
        <v-list-item-title v-if="editingId !== c.conversationId" :class="{ 'font-italic text-medium-emphasis': !c.titled }">
          {{ c.title }}
        </v-list-item-title>
        <v-text-field
          v-else
          v-model="editTitle"
          density="compact"
          variant="outlined"
          hide-details
          autofocus
          placeholder="Title (empty: first message)"
          @click.stop
          @keyup.enter="saveTitle(c)"
          @keyup.esc="editingId = null"
          @blur="saveTitle(c)"
        />
        <v-list-item-subtitle class="text-caption">
          #{{ c.conversationId }} · {{ when(c.lastActiveAt) }}
        </v-list-item-subtitle>
        <template #append>
          <span class="d-flex ga-1" @click.stop>
            <v-btn v-if="list.can('rename')" size="x-small" variant="text" icon="mdi-pencil-outline" title="Rename" :disabled="busy(c)" @click="startEdit(c)" />
            <v-btn
              v-if="list.can('pin') && !c.archived"
              size="x-small"
              variant="text"
              :icon="c.pinned ? 'mdi-pin-off-outline' : 'mdi-pin-outline'"
              :title="c.pinned ? 'Unpin' : 'Pin'"
              :disabled="busy(c)"
              @click="list.setPinned(c.conversationId, !c.pinned)"
            />
            <v-btn
              v-if="list.can('archive')"
              size="x-small"
              variant="text"
              :icon="c.archived ? 'mdi-archive-arrow-up-outline' : 'mdi-archive-outline'"
              :title="c.archived ? 'Restore' : 'Archive'"
              :disabled="busy(c)"
              @click="list.setArchived(c.conversationId, !c.archived)"
            />
            <v-btn
              v-if="list.can('delete')"
              size="x-small"
              variant="text"
              color="error"
              icon="mdi-delete-outline"
              title="Delete"
              :disabled="busy(c) || c.externalId === activeExternalId"
              @click="confirmDelete(c)"
            />
          </span>
        </template>
      </v-list-item>
    </v-list>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { ConversationsHandle, ConversationView } from '../../composables/useConversations';

/** The caller's conversations in the project: open one, rename, pin, archive or delete it (useConversations). */
const props = defineProps<{ list: ConversationsHandle; activeExternalId?: string }>();
const emit = defineEmits<{ (e: 'open', conversation: ConversationView): void }>();

const editingId = ref<number | null>(null);
const editTitle = ref('');

const busy = (c: ConversationView) => props.list.busyId.value === c.conversationId;

function open(c: ConversationView) {
  if (editingId.value === c.conversationId) return;
  emit('open', c);
}

function startEdit(c: ConversationView) {
  editingId.value = c.conversationId;
  editTitle.value = c.titled ? c.title : '';
}

async function saveTitle(c: ConversationView) {
  if (editingId.value !== c.conversationId) return;
  editingId.value = null;
  const next = editTitle.value.trim();
  if (next === (c.titled ? c.title : '')) return;
  await props.list.rename(c.conversationId, next);
}

async function confirmDelete(c: ConversationView) {
  if (window.confirm(`Delete "${c.title}"? It disappears from your list.`)) await props.list.remove(c.conversationId);
}

function clearSearch() {
  props.list.query.value = '';
  props.list.load();
}

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
}

onMounted(() => {
  if (props.list.conversations.value.length === 0) props.list.load();
});
</script>
