<template>
  <div class="channel-stream d-flex flex-column">
    <div class="d-flex align-center ga-2 mb-2">
      <v-btn size="small" variant="text" prepend-icon="mdi-arrow-left" @click="stream.close()">Back</v-btn>
      <v-icon size="18">mdi-pound</v-icon>
      <span class="text-subtitle-2 font-weight-bold text-truncate">{{ stream.title.value || `Channel ${stream.conversationId.value}` }}</span>
      <v-btn size="x-small" variant="text" icon="mdi-refresh" class="ms-auto" title="Check for new messages" @click="stream.refresh()" />
    </div>

    <v-alert v-if="stream.error.value" type="error" variant="tonal" density="compact" class="mb-2" closable>
      {{ stream.error.value }}
    </v-alert>

    <div ref="scroller" class="messages border rounded pa-2 mb-2" style="max-height: 360px; overflow-y: auto;">
      <div v-if="stream.messages.value.length === 0" class="text-caption text-medium-emphasis text-center py-4">No messages yet.</div>
      <div v-for="m in stream.messages.value" :key="m.id" class="mb-2">
        <div class="d-flex align-center ga-2">
          <v-icon size="14">{{ m.sender?.type === 'agent' ? 'mdi-robot-outline' : 'mdi-account-outline' }}</v-icon>
          <span class="text-caption font-weight-bold">{{ m.sender?.name || m.sender?.id || 'unknown' }}</span>
          <span class="text-caption text-disabled">{{ when(m.at) }}</span>
        </div>
        <div class="text-body-2 ms-6" style="white-space: pre-wrap;">{{ m.text }}</div>
      </div>
    </div>

    <div class="d-flex ga-2 align-end">
      <v-textarea
        v-model="draft"
        rows="1"
        auto-grow
        density="compact"
        variant="outlined"
        hide-details
        placeholder="Message the channel (Enter to send, Shift+Enter for a new line)"
        @keydown.enter.exact.prevent="send"
      />
      <v-btn color="primary" variant="flat" :loading="stream.posting.value" :disabled="!draft.trim()" @click="send">Send</v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import type { ChannelStreamHandle } from '../../composables/useChannelStream';

/** The shared message stream of an open channel (useChannelStream): read, follow and post. */
const props = defineProps<{ stream: ChannelStreamHandle }>();

const draft = ref('');
const scroller = ref<HTMLElement | null>(null);

async function send() {
  const text = draft.value;
  if (!text.trim()) return;
  if (await props.stream.post(text)) draft.value = '';
}

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString();
}

// Follow new messages
watch(
  () => props.stream.messages.value.length,
  async () => {
    await nextTick();
    if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight;
  }
);
</script>
