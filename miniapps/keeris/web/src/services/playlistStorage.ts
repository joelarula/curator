import { ref, readonly } from 'vue';

export interface PlaylistItem {
  id: string;
  trackId?: string | number | null;
  uniqueTrackId?: string | number | null;
  title: string;
  artist?: string | null;
  programTitle?: string | null;
  episodeTitle?: string | null;
  episodeUrl?: string | null;
  airDate?: string | null;
  position?: number | string | null;
  notes?: string | null;
  addedAt: string;
}

export interface LocalPlaylist {
  id: string;
  title: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  items: PlaylistItem[];
}

interface PlaylistStorageData {
  version: number;
  playlists: LocalPlaylist[];
}

const STORAGE_KEY = 'keeris_playlists_v1';
const EVENT_NAME = 'keeris:playlists-updated';

function generateId(prefix = 'id'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function loadPlaylistsFromStorage(): LocalPlaylist[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (parsed && Array.isArray(parsed.playlists)) {
      return parsed.playlists;
    }
    return [];
  } catch (err) {
    console.error('[playlistStorage] Failed to parse playlists from localStorage:', err);
    return [];
  }
}

export function savePlaylistsToStorage(playlists: LocalPlaylist[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const payload: PlaylistStorageData = {
      version: 1,
      playlists,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: playlists }));
  } catch (err) {
    console.error('[playlistStorage] Failed to save playlists to localStorage:', err);
  }
}

export function getPlaylists(): LocalPlaylist[] {
  return loadPlaylistsFromStorage();
}

export function getPlaylist(id: string): LocalPlaylist | undefined {
  const all = loadPlaylistsFromStorage();
  return all.find((p) => p.id === id);
}

export function createPlaylist(title: string, description = ''): LocalPlaylist {
  const all = loadPlaylistsFromStorage();
  const now = new Date().toISOString();
  const newPl: LocalPlaylist = {
    id: generateId('pl'),
    title: title.trim() || 'Untitled Playlist',
    description: description.trim(),
    createdAt: now,
    updatedAt: now,
    items: [],
  };
  all.unshift(newPl);
  savePlaylistsToStorage(all);
  return newPl;
}

export function updatePlaylist(
  id: string,
  patch: { title?: string; description?: string }
): LocalPlaylist | undefined {
  const all = loadPlaylistsFromStorage();
  const idx = all.findIndex((p) => p.id === id);
  if (idx === -1) return undefined;

  const now = new Date().toISOString();
  const updated: LocalPlaylist = {
    ...all[idx],
    ...patch,
    title: patch.title !== undefined ? patch.title.trim() : all[idx].title,
    description: patch.description !== undefined ? patch.description.trim() : all[idx].description,
    updatedAt: now,
  };
  all[idx] = updated;
  savePlaylistsToStorage(all);
  return updated;
}

export function deletePlaylist(id: string): boolean {
  const all = loadPlaylistsFromStorage();
  const filtered = all.filter((p) => p.id !== id);
  if (filtered.length === all.length) return false;
  savePlaylistsToStorage(filtered);
  return true;
}

export function addTrackToPlaylist(
  playlistId: string,
  track: Omit<PlaylistItem, 'id' | 'addedAt'>
): PlaylistItem | undefined {
  const all = loadPlaylistsFromStorage();
  const idx = all.findIndex((p) => p.id === playlistId);
  if (idx === -1) return undefined;

  const newItem: PlaylistItem = {
    id: generateId('track'),
    trackId: track.trackId,
    uniqueTrackId: track.uniqueTrackId,
    title: track.title || 'Untitled Track',
    artist: track.artist || null,
    programTitle: track.programTitle || null,
    episodeTitle: track.episodeTitle || null,
    episodeUrl: track.episodeUrl || null,
    airDate: track.airDate || null,
    position: track.position ?? (all[idx].items.length + 1),
    notes: track.notes?.trim() || null,
    addedAt: new Date().toISOString(),
  };

  all[idx].items.push(newItem);
  all[idx].updatedAt = new Date().toISOString();
  savePlaylistsToStorage(all);
  return newItem;
}

export function removeTrackFromPlaylist(playlistId: string, itemId: string): boolean {
  const all = loadPlaylistsFromStorage();
  const idx = all.findIndex((p) => p.id === playlistId);
  if (idx === -1) return false;

  const initialLen = all[idx].items.length;
  all[idx].items = all[idx].items.filter((item) => item.id !== itemId);
  if (all[idx].items.length === initialLen) return false;

  all[idx].updatedAt = new Date().toISOString();
  savePlaylistsToStorage(all);
  return true;
}

export function reorderPlaylistItem(
  playlistId: string,
  fromIndex: number,
  toIndex: number
): boolean {
  const all = loadPlaylistsFromStorage();
  const idx = all.findIndex((p) => p.id === playlistId);
  if (idx === -1) return false;

  const items = all[idx].items;
  if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length) {
    return false;
  }

  const [moved] = items.splice(fromIndex, 1);
  items.splice(toIndex, 0, moved);

  // Update sequential position numbers
  items.forEach((item, i) => {
    item.position = i + 1;
  });

  all[idx].updatedAt = new Date().toISOString();
  savePlaylistsToStorage(all);
  return true;
}

export function updatePlaylistItem(
  playlistId: string,
  itemId: string,
  patch: Partial<PlaylistItem>
): boolean {
  const all = loadPlaylistsFromStorage();
  const plIdx = all.findIndex((p) => p.id === playlistId);
  if (plIdx === -1) return false;

  const itemIdx = all[plIdx].items.findIndex((item) => item.id === itemId);
  if (itemIdx === -1) return false;

  all[plIdx].items[itemIdx] = {
    ...all[plIdx].items[itemIdx],
    ...patch,
  };
  all[plIdx].updatedAt = new Date().toISOString();
  savePlaylistsToStorage(all);
  return true;
}

/**
 * Format a single playlist into Markdown with link metadata.
 */
export function exportPlaylistToMarkdown(playlist: LocalPlaylist): string {
  const lines: string[] = [];

  lines.push(`# ${playlist.title}`);
  if (playlist.description) {
    lines.push(`> ${playlist.description}`);
    lines.push('');
  }
  lines.push(`- **Total Tracks:** ${playlist.items.length}`);
  lines.push(`- **Created:** ${playlist.createdAt ? playlist.createdAt.slice(0, 10) : 'N/A'}`);
  lines.push(`- **Last Updated:** ${playlist.updatedAt ? playlist.updatedAt.slice(0, 10) : 'N/A'}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  if (playlist.items.length === 0) {
    lines.push('*No tracks added to this playlist yet.*');
    return lines.join('\n');
  }

  playlist.items.forEach((item, index) => {
    const num = index + 1;
    const title = item.title || 'Untitled Track';
    const artist = item.artist ? item.artist : 'Unknown Artist';

    lines.push(`${num}. **${artist}** — *${title}*`);

    const metaSublines: string[] = [];
    if (item.programTitle) {
      metaSublines.push(`**Program:** ${item.programTitle}`);
    }
    if (item.episodeTitle) {
      if (item.episodeUrl) {
        metaSublines.push(`**Episode:** [${item.episodeTitle}](${item.episodeUrl})`);
      } else {
        metaSublines.push(`**Episode:** ${item.episodeTitle}`);
      }
    } else if (item.episodeUrl) {
      metaSublines.push(`**Archive Link:** [ERR Archive Audio](${item.episodeUrl})`);
    }

    if (item.airDate) {
      const posStr = item.position ? ` (Track #${item.position})` : '';
      metaSublines.push(`**Air Date:** ${item.airDate}${posStr}`);
    }

    if (item.notes) {
      metaSublines.push(`**Notes:** ${item.notes}`);
    }

    if (metaSublines.length > 0) {
      metaSublines.forEach((sub) => {
        lines.push(`   - ${sub}`);
      });
    }
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * Format all playlists into a single combined Markdown document.
 */
export function exportAllPlaylistsToMarkdown(playlists: LocalPlaylist[]): string {
  const parts: string[] = [
    '# ERR Keeris Playlist Archive',
    `*Generated on ${new Date().toISOString().slice(0, 10)} from Keeris LocalStorage*`,
    '',
    `**Total Playlists:** ${playlists.length}`,
    `**Total Track Entries:** ${playlists.reduce((acc, p) => acc + p.items.length, 0)}`,
    '',
    '---',
    '',
  ];

  playlists.forEach((pl) => {
    parts.push(exportPlaylistToMarkdown(pl));
    parts.push('\n---\n');
  });

  return parts.join('\n');
}

export function exportPlaylistsJson(playlists?: LocalPlaylist[]): string {
  const data = playlists || loadPlaylistsFromStorage();
  const payload: PlaylistStorageData = {
    version: 1,
    playlists: data,
  };
  return JSON.stringify(payload, null, 2);
}

export function importPlaylistsJson(
  jsonStr: string,
  mode: 'merge' | 'replace' = 'merge'
): { success: boolean; count: number; error?: string } {
  try {
    const parsed = JSON.parse(jsonStr);
    let incomingList: LocalPlaylist[] = [];

    if (Array.isArray(parsed)) {
      incomingList = parsed;
    } else if (parsed && Array.isArray(parsed.playlists)) {
      incomingList = parsed.playlists;
    } else {
      return { success: false, count: 0, error: 'Invalid JSON format: missing playlists array.' };
    }

    const current = mode === 'replace' ? [] : loadPlaylistsFromStorage();
    const existingIds = new Set(current.map((p) => p.id));

    let importedCount = 0;
    for (const pl of incomingList) {
      if (!pl.title) continue;
      // Ensure unique ID on merge if collision
      let id = pl.id || generateId('pl');
      if (mode === 'merge' && existingIds.has(id)) {
        id = generateId('pl');
      }

      const cleanPlaylist: LocalPlaylist = {
        id,
        title: String(pl.title).trim(),
        description: String(pl.description || '').trim(),
        createdAt: pl.createdAt || new Date().toISOString(),
        updatedAt: pl.updatedAt || new Date().toISOString(),
        items: Array.isArray(pl.items)
          ? pl.items.map((item: any) => ({
              id: item.id || generateId('track'),
              trackId: item.trackId || null,
              uniqueTrackId: item.uniqueTrackId || null,
              title: String(item.title || 'Untitled Track'),
              artist: item.artist ? String(item.artist) : null,
              programTitle: item.programTitle ? String(item.programTitle) : null,
              episodeTitle: item.episodeTitle ? String(item.episodeTitle) : null,
              episodeUrl: item.episodeUrl ? String(item.episodeUrl) : null,
              airDate: item.airDate ? String(item.airDate) : null,
              position: item.position ?? null,
              notes: item.notes ? String(item.notes) : null,
              addedAt: item.addedAt || new Date().toISOString(),
            }))
          : [],
      };

      current.push(cleanPlaylist);
      existingIds.add(id);
      importedCount++;
    }

    savePlaylistsToStorage(current);
    return { success: true, count: importedCount };
  } catch (err: any) {
    return { success: false, count: 0, error: err.message || 'Failed to parse JSON file' };
  }
}

export function downloadFile(filename: string, content: string, mimeType = 'text/markdown;charset=utf-8'): void {
  if (typeof window === 'undefined') return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback
    }
  }

  // Fallback for older browsers / iframe restrictions
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  } catch (err) {
    console.error('[playlistStorage] Failed to copy to clipboard:', err);
    return false;
  }
}

// Reactive Vue Composable
const reactivePlaylists = ref<LocalPlaylist[]>(loadPlaylistsFromStorage());

if (typeof window !== 'undefined') {
  window.addEventListener(EVENT_NAME, (e: any) => {
    if (e.detail) {
      reactivePlaylists.value = e.detail;
    } else {
      reactivePlaylists.value = loadPlaylistsFromStorage();
    }
  });

  window.addEventListener('storage', (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      reactivePlaylists.value = loadPlaylistsFromStorage();
    }
  });
}

export function usePlaylists() {
  function refresh() {
    reactivePlaylists.value = loadPlaylistsFromStorage();
  }

  return {
    playlists: readonly(reactivePlaylists),
    refresh,
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
  };
}
