/**
 * Curator Content Script Bridge & In-Page Toolbar
 * Relays messages between in-page WebApps (Curator MiniApps) and the
 * Chrome Extension Background Service Worker via a long-lived Port,
 * and mounts the in-page scrape status toolbar.
 */

import { CuratorToolbar } from './toolbar/CuratorToolbar.js';

let port: chrome.runtime.Port | null = null;
let reconnectTimer: any = null;
let toolbarInstance: CuratorToolbar | null = null;

function connectToExtension() {
  try {
    port = chrome.runtime.connect({ name: 'curator-peer-bridge' });

    port.onMessage.addListener((message) => {
      // Forward messages from Extension Hub to page window
      window.postMessage(
        {
          source: 'curator-content-bridge',
          ...message,
        },
        '*'
      );
    });

    port.onDisconnect.addListener(() => {
      console.warn('[Curator Content Bridge] Extension port disconnected. Scheduling reconnect...');
      port = null;
      scheduleReconnect();
    });

    console.log('[Curator Content Bridge] Connected to Curator Extension Hub.');
  } catch (err) {
    console.warn('[Curator Content Bridge] Could not connect to extension:', err);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    connectToExtension();
  }, 2000);
}

// Listen for messages from the page window (BrowserPeerClient)
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.source !== 'curator-peer-client') return;

  if (port) {
    try {
      port.postMessage(data);
    } catch (err) {
      console.error('[Curator Content Bridge] Failed forwarding message to extension:', err);
    }
  } else {
    // If port is not yet ready, reconnect and retry
    connectToExtension();
  }
});

// Mount in-page scrape toolbar
function initToolbar() {
  if (toolbarInstance) return;
  // Mount on HTTP / HTTPS pages
  if (!window.location.href.startsWith('http://') && !window.location.href.startsWith('https://')) return;
  toolbarInstance = new CuratorToolbar();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initToolbar);
} else {
  initToolbar();
}

// Listen for broadcast messages from background worker
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'PAGE_SCRAPE_UPDATED' && message.url === window.location.href) {
      toolbarInstance?.setState({
        status: 'SCRAPED',
        resourceId: message.resourceId,
        lastScraped: message.updatedAt,
      });
    } else if (message?.type === 'ACTIVE_PROJECT_CHANGED') {
      toolbarInstance?.checkStatus();
    }
  });
}

// Initial connection
connectToExtension();
