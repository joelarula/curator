import test from 'node:test';
import assert from 'node:assert/strict';
import {
  saveToOpfs,
  loadFromOpfs,
  deleteFromOpfs,
  migrateFromLocalStorage,
  getStorageEstimate,
  isOpfsSupported
} from '../src/adapter/opfsStorage.ts';

test('isOpfsSupported returns boolean reflecting navigator.storage presence', () => {
  const supported = isOpfsSupported();
  // In Node.js environment without mock, navigator.storage.getDirectory is undefined
  assert.equal(typeof supported, 'boolean');
});

test('OPFS simulated directory handle saves and loads binary bytes', async () => {
  const fileStore = new Map<string, Uint8Array>();

  // Mock navigator.storage.getDirectory
  const mockDirHandle: any = {
    getDirectoryHandle: async () => mockDirHandle,
    getFileHandle: async (name: string, opts?: any) => {
      if (!opts?.create && !fileStore.has(name)) {
        throw new Error('File not found');
      }
      return {
        createWritable: async () => ({
          write: async (data: Uint8Array) => fileStore.set(name, data),
          close: async () => {}
        }),
        getFile: async () => ({
          arrayBuffer: async () => (fileStore.get(name) || new Uint8Array()).buffer
        })
      };
    },
    removeEntry: async (name: string) => {
      fileStore.delete(name);
    }
  };

  Object.defineProperty(navigator, 'storage', {
    value: {
      getDirectory: async () => mockDirHandle,
      estimate: async () => ({ usage: 1024, quota: 104857600 })
    },
    configurable: true,
    writable: true,
  });

  assert.equal(isOpfsSupported(), true);

  const sampleBytes = new Uint8Array([0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x33]); // 'SQLite 3'
  await saveToOpfs('test_db', sampleBytes);

  const loaded = await loadFromOpfs('test_db');
  assert.ok(loaded);
  assert.deepEqual(loaded, sampleBytes);

  const estimate = await getStorageEstimate();
  assert.equal(estimate.isOpfs, true);
  assert.equal(estimate.usage, 1024);
  assert.equal(estimate.quota, 104857600);

  await deleteFromOpfs('test_db');
  const afterDelete = await loadFromOpfs('test_db');
  assert.equal(afterDelete, null);
});

test('migrateFromLocalStorage converts legacy Base64 string to OPFS binary and removes old key', async () => {
  const fileStore = new Map<string, Uint8Array>();

  const mockDirHandle: any = {
    getDirectoryHandle: async () => mockDirHandle,
    getFileHandle: async (name: string, opts?: any) => ({
      createWritable: async () => ({
        write: async (data: Uint8Array) => fileStore.set(name, data),
        close: async () => {}
      }),
      getFile: async () => ({
        arrayBuffer: async () => (fileStore.get(name) || new Uint8Array()).buffer
      })
    })
  };

  Object.defineProperty(navigator, 'storage', {
    value: {
      getDirectory: async () => mockDirHandle
    },
    configurable: true,
    writable: true,
  });

  // Mock chrome.storage.local
  const localStorageStore: Record<string, string> = {
    'curator_sqlite_db': btoa('hello sqlite')
  };

  (globalThis as any).chrome = {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: localStorageStore[key] }),
        remove: async (key: string) => { delete localStorageStore[key]; }
      }
    }
  };

  const migratedBytes = await migrateFromLocalStorage('default');
  assert.ok(migratedBytes);
  assert.equal(new TextDecoder().decode(migratedBytes), 'hello sqlite');

  // Verify migrated into OPFS
  const inOpfs = fileStore.get('curator_default.sqlite3');
  assert.ok(inOpfs);
  assert.equal(new TextDecoder().decode(inOpfs), 'hello sqlite');

  // Verify legacy key removed from chrome.storage.local
  assert.equal(localStorageStore['curator_sqlite_db'], undefined);
});
