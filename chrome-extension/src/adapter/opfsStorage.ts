/**
 * Curator Origin Private File System (OPFS) Binary Storage
 * Provides direct, zero-Base64 binary file persistence for SQLite databases in Chrome Extension.
 */

export interface StorageEstimateInfo {
  usage: number;
  quota: number;
  isOpfs: boolean;
}

export function isOpfsSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function';
}

/**
 * Get or create the dedicated '/curator' directory in OPFS
 */
async function getCuratorDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return await root.getDirectoryHandle('curator', { create: true });
}

function getFileName(dbId: string): string {
  const safeId = dbId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `curator_${safeId}.sqlite3`;
}

/**
 * Save SQLite binary bytes directly to an OPFS file
 */
export async function saveToOpfs(dbId: string, bytes: Uint8Array): Promise<void> {
  if (!isOpfsSupported()) {
    throw new Error('OPFS is not supported in this runtime context.');
  }

  const dir = await getCuratorDir();
  const fileName = getFileName(dbId);
  const fileHandle = await dir.getFileHandle(fileName, { create: true });

  const writable = await (fileHandle as any).createWritable();
  await writable.write(bytes);
  await writable.close();
}

/**
 * Load SQLite binary bytes from an OPFS file. Returns null if file does not exist.
 */
export async function loadFromOpfs(dbId: string): Promise<Uint8Array | null> {
  if (!isOpfsSupported()) {
    return null;
  }

  try {
    const dir = await getCuratorDir();
    const fileName = getFileName(dbId);
    const fileHandle = await dir.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    const buffer = await file.arrayBuffer();

    if (buffer.byteLength > 0) {
      return new Uint8Array(buffer);
    }
  } catch {
    // File not found or empty
  }

  return null;
}

/**
 * Delete an OPFS SQLite database file
 */
export async function deleteFromOpfs(dbId: string): Promise<void> {
  if (!isOpfsSupported()) return;

  try {
    const dir = await getCuratorDir();
    const fileName = getFileName(dbId);
    await dir.removeEntry(fileName);
  } catch {
    // Ignore if not found
  }
}

/**
 * One-time migration helper: imports legacy Base64 state from chrome.storage.local
 * into OPFS binary format, then deletes the large Base64 key to reclaim storage.
 */
export async function migrateFromLocalStorage(dbId: string): Promise<Uint8Array | null> {
  const storageKey = dbId === 'default' ? 'curator_sqlite_db' : `curator_sqlite_db_${dbId}`;

  try {
    const storage = await chrome.storage.local.get(storageKey);
    const base64 = storage[storageKey];

    if (typeof base64 === 'string' && base64.length > 0) {
      // Decode Base64 to Uint8Array
      const binaryString = atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Persist to OPFS
      if (isOpfsSupported()) {
        await saveToOpfs(dbId, bytes);
        // Clean up legacy Base64 storage
        await chrome.storage.local.remove(storageKey);
        console.log(`[OPFS Migration] Migrated ${bytes.byteLength} bytes from ${storageKey} to OPFS (${getFileName(dbId)}) and cleared legacy key.`);
      }

      return bytes;
    }
  } catch (err) {
    console.warn(`[OPFS Migration] Could not migrate ${storageKey}:`, err);
  }

  return null;
}

/**
 * Query live storage quota and usage
 */
export async function getStorageEstimate(): Promise<StorageEstimateInfo> {
  if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      return {
        usage: estimate.usage || 0,
        quota: estimate.quota || 0,
        isOpfs: isOpfsSupported(),
      };
    } catch {
      // Fallback
    }
  }

  return {
    usage: 0,
    quota: 0,
    isOpfs: isOpfsSupported(),
  };
}
