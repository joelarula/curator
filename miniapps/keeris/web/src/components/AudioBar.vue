<template>
  <v-footer
    v-if="currentTrack"
    app
    color="surface-variant"
    elevation="8"
    class="d-flex align-center justify-space-between py-2 px-4 border-t"
    style="z-index: 1000;"
  >
    <div class="d-flex align-center">
      <v-avatar color="primary" variant="tonal" class="mr-3">
        <v-icon icon="mdi-music" />
      </v-avatar>
      <div>
        <div class="font-weight-bold text-subtitle-2">{{ currentTrack.title || currentTrack.rawText }}</div>
        <div class="text-caption text-medium-emphasis">{{ currentTrack.artist || 'Keeris Kauamängiv' }} — {{ currentTrack.episodeTitle }}</div>
      </div>
    </div>

    <div class="d-flex align-center gap-2">
      <v-btn
        :icon="isPlaying ? 'mdi-pause-circle' : 'mdi-play-circle'"
        color="primary"
        size="large"
        variant="text"
        @click="togglePlay"
      />
      <v-btn icon="mdi-close" variant="text" size="small" @click="$emit('close')" />
    </div>

    <audio
      ref="audioRef"
      :src="audioUrl"
      @play="isPlaying = true"
      @pause="isPlaying = false"
      @ended="isPlaying = false"
    />
  </v-footer>
</template>

<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  currentTrack: Object,
});

defineEmits(['close']);

const audioRef = ref(null);
const isPlaying = ref(false);
const audioUrl = ref('');

watch(() => props.currentTrack, (track) => {
  if (track && track.episodeUrl) {
    audioUrl.value = track.episodeUrl;
    if (audioRef.value) {
      audioRef.value.play().catch(() => {});
    }
  }
}, { immediate: true });

function togglePlay() {
  if (!audioRef.value) return;
  if (isPlaying.value) {
    audioRef.value.pause();
  } else {
    audioRef.value.play().catch(() => {});
  }
}
</script>
