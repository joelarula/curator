<template>
  <div class="playlist-container mt-4">
    <!-- View 1: PLAYLIST DETAIL / CURATION VIEW -->
    <template v-if="activePlaylist">
      <v-card color="surface" variant="outlined" class="pa-4 rounded-lg">
        <!-- Detail Header -->
        <div class="d-flex align-center justify-space-between flex-wrap ga-3 pb-3 border-b">
          <div class="d-flex align-center ga-3">
            <v-btn
              variant="tonal"
              size="small"
              prepend-icon="mdi-arrow-left"
              @click="activePlaylistId = null"
            >
              {{ t('playlistManager.allPlaylists') }}
            </v-btn>
            <div>
              <div class="d-flex align-center ga-2">
                <h1 class="text-h5 font-weight-bold mb-0">{{ activePlaylist.title }}</h1>
                <v-btn
                  icon="mdi-pencil"
                  variant="text"
                  size="x-small"
                  title="Edit title and description"
                  @click="openEditDialog(activePlaylist)"
                />
              </div>
              <p v-if="activePlaylist.description" class="text-body-2 text-medium-emphasis mb-0">
                {{ activePlaylist.description }}
              </p>
              <div class="text-caption text-disabled mt-1">
                {{ t('playlistManager.tracksUpdated', { n: activePlaylist.items.length, date: formatDate(activePlaylist.updatedAt) }) }}
              </div>
            </div>
          </div>

          <!-- Detail Action Buttons -->
          <div class="d-flex align-center flex-wrap ga-2">
            <v-btn
              color="primary"
              variant="flat"
              size="small"
              prepend-icon="mdi-content-copy"
              @click="handleCopyMarkdown(activePlaylist)"
            >
              {{ copiedMarkdown ? t('playlistManager.copied') : t('playlistManager.copyMarkdown') }}
            </v-btn>

            <v-btn
              color="secondary"
              variant="tonal"
              size="small"
              prepend-icon="mdi-download"
              @click="handleDownloadMarkdown(activePlaylist)"
            >
              {{ t('playlistManager.downloadMd') }}
            </v-btn>

            <v-btn
              variant="outlined"
              size="small"
              prepend-icon="mdi-plus"
              @click="showAddTrackDialog = true"
            >
              {{ t('playlistManager.customTrack') }}
            </v-btn>

            <v-btn
              color="error"
              variant="text"
              size="small"
              prepend-icon="mdi-delete"
              @click="confirmDeletePlaylist(activePlaylist)"
            >
              {{ t('playlistManager.delete') }}
            </v-btn>
          </div>
        </div>

        <!-- Filter within playlist tracks -->
        <div v-if="activePlaylist.items.length > 0" class="pt-3 pb-2">
          <v-text-field
            v-model="trackSearchQuery"
            density="compact"
            variant="outlined"
            :placeholder="t('playlistManager.filterTracksPlaceholder')"
            prepend-inner-icon="mdi-magnify"
            hide-details
            clearable
          />
        </div>

        <!-- Tracks List -->
        <v-card-text class="px-0 pt-3">
          <div v-if="activePlaylist.items.length === 0" class="text-center py-8 text-medium-emphasis">
            <p class="text-subtitle-1 mb-2">{{ t('playlistManager.noTracksYet') }}</p>
            <p class="text-caption mb-4">
              {{ t('playlistManager.noTracksHint', { songsTab: t('playlistManager.songsTabName') }) }}
            </p>
            <v-btn
              color="primary"
              variant="tonal"
              size="small"
              prepend-icon="mdi-plus"
              @click="showAddTrackDialog = true"
            >
              {{ t('playlistManager.addCustomTrack') }}
            </v-btn>
          </div>

          <div v-else-if="filteredItems.length === 0" class="text-center py-6 text-medium-emphasis">
            {{ t('playlistManager.noTrackMatch', { q: trackSearchQuery }) }}
          </div>

          <div v-else class="tracks-list">
            <div
              v-for="(item, idx) in filteredItems"
              :key="item.id"
              class="track-item d-flex align-center justify-space-between pa-3 mb-2 rounded"
            >
              <div class="d-flex align-start ga-3 flex-grow-1">
                <!-- Position badge -->
                <span class="track-number-badge font-weight-bold">
                  #{{ getOriginalIndex(item) + 1 }}
                </span>

                <div class="flex-grow-1">
                  <!-- Title & Artist -->
                  <div class="d-flex align-baseline flex-wrap ga-2">
                    <span class="font-weight-bold text-subtitle-1">{{ item.title }}</span>
                    <span class="text-body-2 text-medium-emphasis">
                      {{ item.artist || t('playlistManager.unknownArtist') }}
                    </span>
                  </div>

                  <!-- Metadata & Links -->
                  <div class="track-meta d-flex align-center flex-wrap ga-2 mt-1">
                    <span v-if="item.programTitle" class="program-tag">
                      {{ item.programTitle }}
                    </span>

                    <span v-if="item.airDate" class="text-caption text-medium-emphasis">
                      {{ item.airDate }}
                      <span v-if="item.position">{{ t('playlistManager.trackPos', { pos: item.position }) }}</span>
                    </span>

                    <a
                      v-if="item.episodeUrl"
                      :href="item.episodeUrl"
                      target="_blank"
                      rel="noreferrer"
                      class="episode-link"
                      title="Open source episode"
                    >
                      <span>{{ item.episodeTitle || t('playlistManager.sourceEpisode') }}</span>
                      <v-icon icon="mdi-open-in-new" size="x-small" class="ml-1" />
                    </a>
                    <span v-else-if="item.episodeTitle" class="text-caption text-medium-emphasis">
                      — {{ item.episodeTitle }}
                    </span>
                  </div>

                  <!-- Notes -->
                  <div v-if="item.notes" class="track-notes mt-2 pa-2 rounded">
                    <div class="d-flex align-center justify-space-between">
                      <span class="text-caption">
                        <strong>{{ t('playlistManager.notes') }}</strong> {{ item.notes }}
                      </span>
                      <v-btn
                        icon="mdi-pencil"
                        variant="text"
                        size="x-small"
                        density="compact"
                        title="Edit notes"
                        @click="openEditNotesDialog(item)"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <!-- Item Actions -->
              <div class="d-flex align-center ga-1 ml-2">
                <v-btn
                  v-if="!item.notes"
                  icon="mdi-pencil"
                  variant="text"
                  size="small"
                  density="compact"
                  title="Add / edit notes"
                  @click="openEditNotesDialog(item)"
                />

                <v-btn
                  icon="mdi-arrow-up"
                  variant="text"
                  size="small"
                  density="compact"
                  :disabled="getOriginalIndex(item) === 0"
                  title="Move track up"
                  @click="moveTrack(getOriginalIndex(item), -1)"
                />

                <v-btn
                  icon="mdi-arrow-down"
                  variant="text"
                  size="small"
                  density="compact"
                  :disabled="getOriginalIndex(item) === activePlaylist.items.length - 1"
                  title="Move track down"
                  @click="moveTrack(getOriginalIndex(item), 1)"
                />

                <v-btn
                  icon="mdi-delete"
                  color="error"
                  variant="text"
                  size="small"
                  density="compact"
                  title="Remove from playlist"
                  @click="removeTrack(item.id)"
                />
              </div>
            </div>
          </div>
        </v-card-text>
      </v-card>
    </template>

    <!-- View 2: ALL PLAYLISTS OVERVIEW -->
    <template v-else>
      <v-card color="surface" variant="outlined" class="pa-4 rounded-lg">
        <v-card-title class="d-flex align-center justify-space-between flex-wrap ga-3 pb-3">
          <div class="d-flex align-center ga-2">
            <v-icon icon="mdi-playlist-music" color="secondary" />
            <div>
              <span class="text-h6 font-weight-bold">{{ t('playlistManager.curatedPlaylists') }}</span>
              <span class="text-caption text-medium-emphasis ml-2">
                {{ t('playlistManager.playlistCount', { n: playlists.length, tracks: totalSavedTracks }) }}
              </span>
            </div>
          </div>

          <div class="d-flex align-center flex-wrap ga-2">
            <v-btn
              color="primary"
              variant="flat"
              size="small"
              prepend-icon="mdi-plus"
              @click="showCreateDialog = true"
            >
              {{ t('playlistManager.newPlaylist') }}
            </v-btn>

            <v-btn
              v-if="playlists.length > 0"
              color="secondary"
              variant="tonal"
              size="small"
              prepend-icon="mdi-file-document-outline"
              @click="showExportAllModal = true"
            >
              {{ t('playlistManager.exportAll') }}
            </v-btn>

            <v-btn
              variant="outlined"
              size="small"
              prepend-icon="mdi-download"
              title="Backup all playlists to a JSON file"
              @click="handleBackupJson"
            >
              {{ t('playlistManager.backupJson') }}
            </v-btn>

            <v-btn
              variant="outlined"
              size="small"
              prepend-icon="mdi-upload"
              title="Restore or import playlists from JSON"
              @click="showImportDialog = true"
            >
              {{ t('playlistManager.importJson') }}
            </v-btn>
          </div>
        </v-card-title>

        <v-card-text>
          <!-- Empty State -->
          <div v-if="playlists.length === 0" class="text-center py-8">
            <v-icon icon="mdi-playlist-music" size="64" color="medium-emphasis" class="mb-2" />
            <div class="text-h6 font-weight-bold mb-1">{{ t('playlistManager.noPlaylistsTitle') }}</div>
            <p class="text-body-2 text-medium-emphasis mb-4 max-w-md mx-auto">
              {{ t('playlistManager.noPlaylistsDesc') }}
            </p>
            <v-btn color="primary" variant="flat" prepend-icon="mdi-plus" @click="showCreateDialog = true">
              {{ t('playlistManager.createFirstPlaylist') }}
            </v-btn>
          </div>

          <!-- Playlists Cards Grid -->
          <v-row v-else>
            <v-col v-for="pl in playlists" :key="pl.id" cols="12" md="6">
              <v-card
                variant="tonal"
                color="surface-variant"
                class="pa-4 playlist-card rounded-lg h-100 d-flex flex-column justify-space-between"
                @click="openPlaylist(pl.id)"
              >
                <div>
                  <div class="d-flex align-start justify-space-between ga-2 mb-2">
                    <div class="font-weight-bold text-h6 card-title">{{ pl.title }}</div>
                    <v-chip size="small" color="primary" variant="flat">
                      {{ pl.items.length }} {{ pl.items.length === 1 ? t('playlistManager.track') : t('playlistManager.tracks') }}
                    </v-chip>
                  </div>
                  <p class="text-body-2 text-medium-emphasis card-desc mb-3">
                    {{ pl.description || t('playlistManager.noDescription') }}
                  </p>
                </div>

                <div class="card-footer d-flex align-center justify-space-between pt-2 border-t mt-2">
                  <span class="text-caption text-disabled">
                    {{ t('playlistManager.updatedAt', { date: formatDate(pl.updatedAt) }) }}
                  </span>
                  <div class="d-flex align-center ga-1" @click.stop>
                    <v-btn
                      variant="tonal"
                      color="secondary"
                      size="small"
                      @click="openPlaylist(pl.id)"
                    >
                      {{ t('playlistManager.openAndCurate') }}
                    </v-btn>

                    <v-btn
                      icon="mdi-content-copy"
                      variant="text"
                      size="small"
                      density="compact"
                      title="Copy Markdown"
                      @click="handleCopyMarkdown(pl)"
                    />

                    <v-btn
                      icon="mdi-download"
                      variant="text"
                      size="small"
                      density="compact"
                      title="Download .md"
                      @click="handleDownloadMarkdown(pl)"
                    />

                    <v-btn
                      icon="mdi-delete"
                      color="error"
                      variant="text"
                      size="small"
                      density="compact"
                      title="Delete playlist"
                      @click="confirmDeletePlaylist(pl)"
                    />
                  </div>
                </div>
              </v-card>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>
    </template>

    <!-- DIALOG: Create Playlist -->
    <v-dialog v-model="showCreateDialog" max-width="480">
      <v-card color="surface" class="pa-3 rounded-lg">
        <v-card-title class="font-weight-bold">{{ t('playlistManager.createDialogTitle') }}</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="newTitle"
            :label="t('playlistManager.playlistTitleLabel')"
            :placeholder="t('playlistManager.playlistTitlePlaceholder')"
            variant="outlined"
            density="compact"
            class="mb-3"
            autofocus
          />
          <v-textarea
            v-model="newDescription"
            :label="t('playlistManager.descLabel')"
            :placeholder="t('playlistManager.descPlaceholder')"
            variant="outlined"
            density="compact"
            rows="3"
          />
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="showCreateDialog = false">{{ t('playlistManager.cancel') }}</v-btn>
          <v-btn
            color="primary"
            variant="flat"
            :disabled="!newTitle.trim()"
            @click="handleCreatePlaylist"
          >
            {{ t('playlistManager.create') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- DIALOG: Edit Playlist -->
    <v-dialog v-model="showEditDialog" max-width="480">
      <v-card color="surface" class="pa-3 rounded-lg">
        <v-card-title class="font-weight-bold">{{ t('playlistManager.editDialogTitle') }}</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="editTitle"
            label="Playlist Title"
            variant="outlined"
            density="compact"
            class="mb-3"
            autofocus
          />
          <v-textarea
            v-model="editDescription"
            :label="t('playlistManager.descLabel')"
            variant="outlined"
            density="compact"
            rows="3"
          />
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="showEditDialog = false">{{ t('playlistManager.cancel') }}</v-btn>
          <v-btn
            color="primary"
            variant="flat"
            :disabled="!editTitle.trim()"
            @click="handleSaveEditPlaylist"
          >
            {{ t('playlistManager.saveChanges') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- DIALOG: Add Custom Track -->
    <v-dialog v-model="showAddTrackDialog" max-width="500">
      <v-card color="surface" class="pa-3 rounded-lg">
        <v-card-title class="font-weight-bold">{{ t('playlistManager.addCustomTrackTitle') }}</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="customTrackTitle"
            :label="t('playlistManager.songTitleLabel')"
            :placeholder="t('playlistManager.songTitlePlaceholder')"
            variant="outlined"
            density="compact"
            class="mb-3"
            autofocus
          />
          <v-text-field
            v-model="customTrackArtist"
            :label="t('playlistManager.artistLabel')"
            :placeholder="t('playlistManager.artistPlaceholder')"
            variant="outlined"
            density="compact"
            class="mb-3"
          />
          <v-text-field
            v-model="customTrackProgram"
            :label="t('playlistManager.programLabel')"
            :placeholder="t('playlistManager.programPlaceholder')"
            variant="outlined"
            density="compact"
            class="mb-3"
          />
          <v-text-field
            v-model="customTrackEpisodeTitle"
            :label="t('playlistManager.episodeTitleLabel')"
            :placeholder="t('playlistManager.episodeTitlePlaceholder')"
            variant="outlined"
            density="compact"
            class="mb-3"
          />
          <v-text-field
            v-model="customTrackEpisodeUrl"
            :label="t('playlistManager.episodeUrlLabel')"
            :placeholder="t('playlistManager.episodeUrlPlaceholder')"
            variant="outlined"
            density="compact"
            class="mb-3"
          />
          <v-textarea
            v-model="customTrackNotes"
            :label="t('playlistManager.notesLabel')"
            :placeholder="t('playlistManager.notesPlaceholder')"
            variant="outlined"
            density="compact"
            rows="2"
          />
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="showAddTrackDialog = false">{{ t('playlistManager.cancel') }}</v-btn>
          <v-btn
            color="primary"
            variant="flat"
            :disabled="!customTrackTitle.trim()"
            @click="handleAddCustomTrack"
          >
            {{ t('playlistManager.addToPlaylistBtn') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- DIALOG: Edit Track Notes -->
    <v-dialog v-model="showEditNotesDialog" max-width="480">
      <v-card color="surface" class="pa-3 rounded-lg">
        <v-card-title class="font-weight-bold">{{ t('playlistManager.editNotesTitle') }}</v-card-title>
        <v-card-text>
          <div v-if="editingItem" class="text-caption text-medium-emphasis mb-3">
            {{ editingItem.artist }} — {{ editingItem.title }}
          </div>
          <v-textarea
            v-model="editingNotes"
            :label="t('playlistManager.editNotesLabel')"
            :placeholder="t('playlistManager.editNotesPlaceholder')"
            variant="outlined"
            density="compact"
            rows="3"
            autofocus
          />
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="showEditNotesDialog = false">{{ t('playlistManager.cancel') }}</v-btn>
          <v-btn color="primary" variant="flat" @click="handleSaveNotes">{{ t('playlistManager.save') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- DIALOG: Confirm Delete Playlist -->
    <v-dialog v-model="showDeleteDialog" max-width="420">
      <v-card color="surface" class="pa-3 rounded-lg">
        <v-card-title class="font-weight-bold text-error">{{ t('playlistManager.deleteTitle') }}</v-card-title>
        <v-card-text>
          {{ t('playlistManager.deleteConfirm', { title: deletingPlaylist?.title, n: deletingPlaylist?.items.length }) }}
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="showDeleteDialog = false">{{ t('playlistManager.cancel') }}</v-btn>
          <v-btn color="error" variant="flat" @click="handleConfirmDelete">{{ t('playlistManager.delete') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- DIALOG: Export All Markdown Preview -->
    <v-dialog v-model="showExportAllModal" max-width="700">
      <v-card color="surface" class="pa-4 rounded-lg">
        <v-card-title class="d-flex align-center justify-space-between">
          <span class="font-weight-bold">{{ t('playlistManager.exportAllTitle') }}</span>
          <v-btn icon="mdi-close" variant="text" size="small" @click="showExportAllModal = false" />
        </v-card-title>
        <v-card-text>
          <p class="text-caption text-medium-emphasis mb-2">
            {{ t('playlistManager.exportAllDesc') }}
          </p>
          <v-textarea
            :model-value="allPlaylistsMarkdownText"
            readonly
            rows="12"
            variant="outlined"
            density="compact"
            class="markdown-preview"
          />
        </v-card-text>
        <v-card-actions class="justify-end ga-2">
          <v-btn
            color="primary"
            variant="flat"
            prepend-icon="mdi-content-copy"
            @click="handleCopyAllMarkdown"
          >
            {{ copiedAllMarkdown ? t('playlistManager.copied') : t('playlistManager.copyToClipboard') }}
          </v-btn>
          <v-btn
            color="secondary"
            variant="tonal"
            prepend-icon="mdi-download"
            @click="handleDownloadAllMarkdown"
          >
            Download .md
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- DIALOG: Import JSON -->
    <v-dialog v-model="showImportDialog" max-width="520">
      <v-card color="surface" class="pa-4 rounded-lg">
        <v-card-title class="font-weight-bold">{{ t('playlistManager.importTitle') }}</v-card-title>
        <v-card-text>
          <p class="text-caption text-medium-emphasis mb-3">
            {{ t('playlistManager.importDesc') }}
          </p>

          <v-file-input
            :label="t('playlistManager.uploadJsonLabel')"
            accept=".json,application/json"
            variant="outlined"
            density="compact"
            class="mb-3"
            @change="handleJsonFileChosen"
          />

          <v-textarea
            v-model="importJsonText"
            :label="t('playlistManager.pasteJsonLabel')"
            rows="4"
            variant="outlined"
            density="compact"
            class="mb-3"
          />

          <v-radio-group v-model="importMode" inline density="compact" hide-details>
            <v-radio :label="t('playlistManager.mergeMode')" value="merge" />
            <v-radio :label="t('playlistManager.replaceMode')" value="replace" />
          </v-radio-group>

          <v-alert v-if="importError" type="error" variant="tonal" density="compact" class="mt-3">
            {{ importError }}
          </v-alert>
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="showImportDialog = false">{{ t('playlistManager.cancel') }}</v-btn>
          <v-btn
            color="primary"
            variant="flat"
            :disabled="!importJsonText.trim()"
            @click="handleExecuteImport"
          >
            {{ t('playlistManager.import') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Toast Snackbar -->
    <v-snackbar v-model="toastVisible" timeout="3000" :color="toastColor" location="bottom right">
      {{ toastMessage }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  usePlaylists,
  type LocalPlaylist,
  type PlaylistItem,
} from '../services/playlistStorage';

const {
  playlists,
  createPlaylist,
  updatePlaylist,
  deletePlaylist,
  addTrackToPlaylist,
  removeTrackFromPlaylist,
  reorderPlaylistItem,
  updatePlaylistItem,
  exportPlaylistToMarkdown,
  exportAllPlaylistsToMarkdown,
  exportPlaylistsJson,
  importPlaylistsJson,
  downloadFile,
  copyToClipboard,
} = usePlaylists();

const { t } = useI18n();

// Active state
const activePlaylistId = ref<string | null>(null);
const trackSearchQuery = ref('');

// Modals
const showCreateDialog = ref(false);
const newTitle = ref('');
const newDescription = ref('');

const showEditDialog = ref(false);
const editingPlaylistId = ref<string | null>(null);
const editTitle = ref('');
const editDescription = ref('');

const showAddTrackDialog = ref(false);
const customTrackTitle = ref('');
const customTrackArtist = ref('');
const customTrackProgram = ref('');
const customTrackEpisodeTitle = ref('');
const customTrackEpisodeUrl = ref('');
const customTrackNotes = ref('');

const showEditNotesDialog = ref(false);
const editingItem = ref<PlaylistItem | null>(null);
const editingNotes = ref('');

const showDeleteDialog = ref(false);
const deletingPlaylist = ref<LocalPlaylist | null>(null);

const showExportAllModal = ref(false);
const showImportDialog = ref(false);
const importJsonText = ref('');
const importMode = ref<'merge' | 'replace'>('merge');
const importError = ref('');

// Feedback
const copiedMarkdown = ref(false);
const copiedAllMarkdown = ref(false);
const toastVisible = ref(false);
const toastMessage = ref('');
const toastColor = ref('success');

function showToast(msg: string, color = 'success') {
  toastMessage.value = msg;
  toastColor.value = color;
  toastVisible.value = true;
}

const activePlaylist = computed(() => {
  if (!activePlaylistId.value) return null;
  return playlists.value.find((p) => p.id === activePlaylistId.value) || null;
});

const totalSavedTracks = computed(() => {
  return playlists.value.reduce((acc, p) => acc + p.items.length, 0);
});

const filteredItems = computed(() => {
  if (!activePlaylist.value) return [];
  const q = trackSearchQuery.value.trim().toLowerCase();
  if (!q) return activePlaylist.value.items;

  return activePlaylist.value.items.filter((item) => {
    return (
      (item.title && item.title.toLowerCase().includes(q)) ||
      (item.artist && item.artist.toLowerCase().includes(q)) ||
      (item.programTitle && item.programTitle.toLowerCase().includes(q)) ||
      (item.episodeTitle && item.episodeTitle.toLowerCase().includes(q)) ||
      (item.notes && item.notes.toLowerCase().includes(q))
    );
  });
});

function getOriginalIndex(item: PlaylistItem): number {
  if (!activePlaylist.value) return 0;
  return activePlaylist.value.items.findIndex((i) => i.id === item.id);
}

function formatDate(isoStr?: string | null): string {
  if (!isoStr) return 'N/A';
  return isoStr.slice(0, 10);
}

function openPlaylist(id: string) {
  activePlaylistId.value = id;
  trackSearchQuery.value = '';
}

// Playlist Create
function handleCreatePlaylist() {
  if (!newTitle.value.trim()) return;
  const created = createPlaylist(newTitle.value, newDescription.value);
  newTitle.value = '';
  newDescription.value = '';
  showCreateDialog.value = false;
  activePlaylistId.value = created.id;
  showToast(t('playlistManager.toastCreated', { title: created.title }));
}

// Playlist Edit
function openEditDialog(pl: LocalPlaylist) {
  editingPlaylistId.value = pl.id;
  editTitle.value = pl.title;
  editDescription.value = pl.description || '';
  showEditDialog.value = true;
}

function handleSaveEditPlaylist() {
  if (!editingPlaylistId.value || !editTitle.value.trim()) return;
  updatePlaylist(editingPlaylistId.value, {
    title: editTitle.value,
    description: editDescription.value,
  });
  showEditDialog.value = false;
  showToast(t('playlistManager.toastUpdated'));
}

// Playlist Delete
function confirmDeletePlaylist(pl: LocalPlaylist) {
  deletingPlaylist.value = pl;
  showDeleteDialog.value = true;
}

function handleConfirmDelete() {
  if (!deletingPlaylist.value) return;
  const title = deletingPlaylist.value.title;
  deletePlaylist(deletingPlaylist.value.id);
  if (activePlaylistId.value === deletingPlaylist.value.id) {
    activePlaylistId.value = null;
  }
  showDeleteDialog.value = false;
  deletingPlaylist.value = null;
  showToast(t('playlistManager.toastDeleted', { title }));
}

// Custom Track
function handleAddCustomTrack() {
  if (!activePlaylistId.value || !customTrackTitle.value.trim()) return;

  addTrackToPlaylist(activePlaylistId.value, {
    title: customTrackTitle.value.trim(),
    artist: customTrackArtist.value.trim() || null,
    programTitle: customTrackProgram.value.trim() || null,
    episodeTitle: customTrackEpisodeTitle.value.trim() || null,
    episodeUrl: customTrackEpisodeUrl.value.trim() || null,
    notes: customTrackNotes.value.trim() || null,
  });

  customTrackTitle.value = '';
  customTrackArtist.value = '';
  customTrackProgram.value = '';
  customTrackEpisodeTitle.value = '';
  customTrackEpisodeUrl.value = '';
  customTrackNotes.value = '';
  showAddTrackDialog.value = false;
  showToast(t('playlistManager.toastCustomAdded'));
}

// Edit Notes
function openEditNotesDialog(item: PlaylistItem) {
  editingItem.value = item;
  editingNotes.value = item.notes || '';
  showEditNotesDialog.value = true;
}

function handleSaveNotes() {
  if (!activePlaylistId.value || !editingItem.value) return;
  updatePlaylistItem(activePlaylistId.value, editingItem.value.id, {
    notes: editingNotes.value.trim() || null,
  });
  showEditNotesDialog.value = false;
  editingItem.value = null;
  showToast(t('playlistManager.toastNotesUpdated'));
}

// Reorder & Remove
function moveTrack(fromIdx: number, delta: number) {
  if (!activePlaylistId.value) return;
  const toIdx = fromIdx + delta;
  reorderPlaylistItem(activePlaylistId.value, fromIdx, toIdx);
}

function removeTrack(itemId: string) {
  if (!activePlaylistId.value) return;
  removeTrackFromPlaylist(activePlaylistId.value, itemId);
  showToast(t('playlistManager.toastTrackRemoved'));
}

// Markdown Export
async function handleCopyMarkdown(pl: LocalPlaylist) {
  const md = exportPlaylistToMarkdown(pl);
  const ok = await copyToClipboard(md);
  if (ok) {
    copiedMarkdown.value = true;
    showToast(t('playlistManager.toastMarkdownCopied'));
    setTimeout(() => {
      copiedMarkdown.value = false;
    }, 2500);
  } else {
    showToast(t('playlistManager.toastImportFailed', { msg: '' }), 'error');
  }
}

function handleDownloadMarkdown(pl: LocalPlaylist) {
  const md = exportPlaylistToMarkdown(pl);
  const slug = pl.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'playlist';
  downloadFile(`${slug}.md`, md, 'text/markdown;charset=utf-8');
  showToast(`Downloaded ${slug}.md`);
}

const allPlaylistsMarkdownText = computed(() => {
  return exportAllPlaylistsToMarkdown(playlists.value);
});

async function handleCopyAllMarkdown() {
  const ok = await copyToClipboard(allPlaylistsMarkdownText.value);
  if (ok) {
    copiedAllMarkdown.value = true;
    showToast(t('playlistManager.toastMarkdownCopied'));
    setTimeout(() => {
      copiedAllMarkdown.value = false;
    }, 2500);
  } else {
    showToast(t('playlistManager.toastImportFailed', { msg: '' }), 'error');
  }
}

function handleDownloadAllMarkdown() {
  downloadFile('keeris-playlists.md', allPlaylistsMarkdownText.value, 'text/markdown;charset=utf-8');
  showExportAllModal.value = false;
  showToast('Downloaded keeris-playlists.md');
}

// JSON Backup & Import
function handleBackupJson() {
  const json = exportPlaylistsJson(playlists.value);
  const dateStr = new Date().toISOString().slice(0, 10);
  downloadFile(`keeris-playlists-backup-${dateStr}.json`, json, 'application/json;charset=utf-8');
  showToast('Downloaded playlists JSON backup');
}

function handleJsonFileChosen(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;
  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = (ev) => {
    importJsonText.value = String(ev.target?.result || '');
  };
  reader.readAsText(file);
}

function handleExecuteImport() {
  importError.value = '';
  const res = importPlaylistsJson(importJsonText.value, importMode.value);
  if (res.success) {
    showImportDialog.value = false;
    importJsonText.value = '';
    showToast(t('playlistManager.toastImportedPlaylists', { n: res.count }));
  } else {
    importError.value = res.error ? t('playlistManager.toastImportFailed', { msg: res.error }) : t('playlistManager.toastImportFailed', { msg: '' });
  }
}
</script>

<style scoped>
.playlist-container {
  max-width: 1200px;
  margin: 0 auto;
}

.playlist-card {
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
  border: 1px solid var(--border-default);
}

.playlist-card:hover {
  transform: translateY(-2px);
  border-color: var(--accent);
}

.card-title {
  color: var(--text-primary);
}

.card-desc {
  min-height: 40px;
  line-height: 1.4;
  color: var(--text-secondary);
}

.track-item {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.track-item:hover {
  background: var(--bg-elevated);
  border-color: var(--accent);
}

.track-number-badge {
  background: var(--stats-bg);
  color: var(--text-primary);
  font-size: 0.8rem;
  padding: 3px 8px;
  border-radius: 4px;
  min-width: 32px;
  text-align: center;
}

.program-tag {
  background: var(--nav-active-bg);
  color: var(--nav-active-text);
  font-size: 0.7rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 3px;
  border: 1px solid var(--border-default);
}

.episode-link {
  font-size: 0.8rem;
  color: var(--accent);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
}

.episode-link:hover {
  text-decoration: underline;
  color: var(--accent-hover);
}

.track-notes {
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
}

.markdown-preview :deep(textarea) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.85rem;
  line-height: 1.4;
}

.max-w-md {
  max-width: 440px;
}
</style>
