import {
  saveToOpfs,
  loadFromOpfs,
  deleteFromOpfs,
  getStorageEstimate,
  isOpfsSupported
} from '../adapter/opfsStorage.js';

console.log('[Curator Offscreen] Worker initialized. OPFS Supported:', isOpfsSupported());

// Listen for background requests
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== 'offscreen') return;

  switch (message.type) {
    case 'OFFSCREEN_PING': {
      sendResponse({ status: 'ok', isOpfs: isOpfsSupported() });
      break;
    }

    case 'OFFSCREEN_STORAGE_ESTIMATE': {
      getStorageEstimate()
        .then(estimate => sendResponse({ status: 'ok', estimate }))
        .catch(err => sendResponse({ status: 'error', error: err?.message || String(err) }));
      return true; // async
    }

    case 'OFFSCREEN_OPFS_SAVE': {
      const { dbId, bytes } = message;
      saveToOpfs(dbId, new Uint8Array(bytes))
        .then(() => sendResponse({ status: 'ok' }))
        .catch(err => sendResponse({ status: 'error', error: err?.message || String(err) }));
      return true; // async
    }

    case 'OFFSCREEN_OPFS_LOAD': {
      const { dbId } = message;
      loadFromOpfs(dbId)
        .then(bytes => {
          if (bytes) {
            sendResponse({ status: 'ok', bytes: Array.from(bytes) });
          } else {
            sendResponse({ status: 'ok', bytes: null });
          }
        })
        .catch(err => sendResponse({ status: 'error', error: err?.message || String(err) }));
      return true; // async
    }

    case 'OFFSCREEN_OPFS_DELETE': {
      const { dbId } = message;
      deleteFromOpfs(dbId)
        .then(() => sendResponse({ status: 'ok' }))
        .catch(err => sendResponse({ status: 'error', error: err?.message || String(err) }));
      return true; // async
    }
  }
});
