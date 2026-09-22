<template>
  <v-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" max-width="500">
    <v-card color="surface" class="pa-4 rounded-lg">
      <v-card-title class="d-flex align-center justify-space-between pb-2">
        <div class="d-flex align-center">
          <v-icon icon="mdi-playlist-plus" color="secondary" class="mr-2" />
          <span class="text-h6 font-weight-bold">{{ t('addToPlaylist.dialogTitle') }}</span>
        </div>
        <v-btn icon="mdi-close" variant="text" size="small" @click="close" />
      </v-card-title>

      <v-card-text class="pt-2">
        <!-- Target Track Summary -->
        <div v-if="track" class="track-summary pa-3 mb-4 rounded-md">
          <div class="font-weight-bold text-subtitle-1">{{ track.title || t('addToPlaylist.untitledTrack') }}</div>
          <div class="text-caption text-medium-emphasis">
            {{ track.artist || t('addToPlaylist.unknownArtist') }}
            <span v-if="track.programTitle"> · {{ track.programTitle }}</span>
            <span v-if="track.episodeTitle"> — {{ track.episodeTitle }}</span>
          </div>
        </div>

        <!-- Notification / Status Banner -->
        <v-alert
          v-if="statusMessage"
          :type="statusType"
          variant="tonal"
          density="compact"
          class="mb-3"
        >
          {{ statusMessage }}
        </v-alert>

        <!-- Choose Existing Playlist -->
        <div v-if="playlists.length > 0">
          <label class="text-caption font-weight-bold text-medium-emphasis mb-1 d-block">
            {{ t('addToPlaylist.selectLabel') }}
          </label>
          <v-select
            v-model="selectedPlaylistId"
            :items="playlistOptions"
            item-title="title"
            item-value="id"
            variant="outlined"
            density="comfortable"
            :placeholder="t('addToPlaylist.choosePlaceholder')"
            hide-details
            class="mb-3"
          >
            <template #item="{ props, item }">
              <v-list-item v-bind="props" :subtitle="`${item.raw.items.length} ${t('addToPlaylist.trackCount', { n: item.raw.items.length })}`" />
            </template>
          </v-select>
        </div>

        <div v-else class="text-caption text-medium-emphasis mb-3">
          {{ t('addToPlaylist.noPlaylists') }}
        </div>

        <!-- Inline Quick Create New Playlist -->
        <div class="mt-2 mb-3">
          <div
            class="d-flex align-center cursor-pointer text-caption text-secondary font-weight-bold"
            @click="isCreatingNew = !isCreatingNew"
          >
            <v-icon :icon="isCreatingNew ? 'mdi-arrow-up' : 'mdi-plus'" size="small" class="mr-1" />
            {{ isCreatingNew ? t('addToPlaylist.useExisting') : t('addToPlaylist.createNew') }}
          </div>

          <div v-if="isCreatingNew || playlists.length === 0" class="mt-2 pa-3 new-playlist-box rounded">
            <v-text-field
              v-model="newPlaylistTitle"
              :label="t('addToPlaylist.newTitleLabel')"
              :placeholder="t('addToPlaylist.newTitlePlaceholder')"
              variant="outlined"
              density="compact"
              hide-details
              class="mb-2"
              autofocus
            />
            <v-text-field
              v-model="newPlaylistDesc"
              :label="t('addToPlaylist.newDescLabel')"
              :placeholder="t('addToPlaylist.newDescPlaceholder')"
              variant="outlined"
              density="compact"
              hide-details
            />
          </div>
        </div>

        <!-- Track User Notes -->
        <v-textarea
          v-model="trackNotes"
          :label="t('addToPlaylist.trackNotesLabel')"
          :placeholder="t('addToPlaylist.trackNotesPlaceholder')"
          variant="outlined"
          density="compact"
          rows="2"
          hide-details
          class="mt-2"
        />
      </v-card-text>

      <v-card-actions class="justify-end pt-2">
        <v-btn variant="text" @click="close">{{ t('addToPlaylist.cancel') }}</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :disabled="!canSave"
          :loading="saving"
          @click="save"
        >
          {{ t('addToPlaylist.addTrack') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { usePlaylists, type PlaylistItem } from '../services/playlistStorage';

const props = defineProps<{
  modelValue: boolean;
  track: Partial<PlaylistItem> | null;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'added', payload: { playlistTitle: string }): void;
}>();

const { t } = useI18n();
const { playlists, createPlaylist, addTrackToPlaylist } = usePlaylists();

const selectedPlaylistId = ref<string>('');
const isCreatingNew = ref(false);
const newPlaylistTitle = ref('');
const newPlaylistDesc = ref('');
const trackNotes = ref('');
const saving = ref(false);
const statusMessage = ref('');
const statusType = ref<'success' | 'error'>('success');

const playlistOptions = computed(() => {
  return playlists.value.map((p) => ({
    id: p.id,
    title: `${p.title} (${t('addToPlaylist.trackCount', { n: p.items.length })})`,
    raw: p,
  }));
});

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      statusMessage.value = '';
      trackNotes.value = '';
      if (playlists.value.length > 0) {
        selectedPlaylistId.value = playlists.value[0].id;
        isCreatingNew.value = false;
      } else {
        selectedPlaylistId.value = '';
        isCreatingNew.value = true;
      }
    }
  }
);

const canSave = computed(() => {
  if (isCreatingNew.value || playlists.value.length === 0) {
    return Boolean(newPlaylistTitle.value.trim());
  }
  return Boolean(selectedPlaylistId.value);
});

function close() {
  emit('update:modelValue', false);
}

function save() {
  if (!props.track || !canSave.value) return;

  saving.value = true;
  try {
    let targetId = selectedPlaylistId.value;
    let targetTitle = '';

    if (isCreatingNew.value || playlists.value.length === 0) {
      const created = createPlaylist(newPlaylistTitle.value, newPlaylistDesc.value);
      targetId = created.id;
      targetTitle = created.title;
      newPlaylistTitle.value = '';
      newPlaylistDesc.value = '';
    } else {
      const pl = playlists.value.find((p) => p.id === targetId);
      targetTitle = pl ? pl.title : 'Playlist';
    }

    addTrackToPlaylist(targetId, {
      title: props.track.title || 'Untitled Track',
      artist: props.track.artist || null,
      programTitle: props.track.programTitle || null,
      episodeTitle: props.track.episodeTitle || null,
      episodeUrl: props.track.episodeUrl || null,
      airDate: props.track.airDate || null,
      position: props.track.position ?? null,
      trackId: props.track.trackId || null,
      uniqueTrackId: props.track.uniqueTrackId || null,
      notes: trackNotes.value.trim() || null,
    });

    statusType.value = 'success';
    statusMessage.value = t('addToPlaylist.savedTo', { title: targetTitle });
    emit('added', { playlistTitle: targetTitle });

    setTimeout(() => {
      saving.value = false;
      close();
    }, 600);
  } catch (err) {
    saving.value = false;
    statusType.value = 'error';
    statusMessage.value = t('addToPlaylist.saveFailed');
    console.error(err);
  }
}
</script>

<style scoped>
.track-summary {
  background: rgba(255, 255, 255, 0.05);
  border-left: 3px solid #10b981;
}

.new-playlist-box {
  background: rgba(255, 255, 255, 0.03);
  border: 1px dashed rgba(255, 255, 255, 0.15);
}

.cursor-pointer {
  cursor: pointer;
}
</style>
