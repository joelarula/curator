// Define global XMLHttpRequest mock for browser extension service worker (sql.js / Emscripten compatibility)
if (typeof (globalThis as any).XMLHttpRequest === 'undefined') {
    (globalThis as any).XMLHttpRequest = class MockXMLHttpRequest {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        response: any = null;
        responseType: string = '';
        status: number = 0;
        statusText: string = '';
        readyState: number = 0;
        private url: string = '';
        private method: string = '';

        open(method: string, url: string, async?: boolean) {
            this.method = method;
            this.url = url;
        }

        send(body?: any) {
            fetch(this.url)
                .then(res => {
                    this.status = res.status;
                    this.statusText = res.statusText;
                    if (this.responseType === 'arraybuffer') {
                        return res.arrayBuffer();
                    } else if (this.responseType === 'json') {
                        return res.json();
                    } else {
                        return res.text();
                    }
                })
                .then(data => {
                    this.response = data;
                    this.readyState = 4;
                    if (this.onload) this.onload();
                })
                .catch(err => {
                    console.error('[Mock XMLHttpRequest] Fetch failed:', err);
                    if (this.onerror) this.onerror();
                });
        }
    };
}

import initSqlJs from 'sql.js';
import { CuratorWasmCore } from '../../server/src/wasm-core/index.js';
import { PeerDiscoveryHub } from './p2p/PeerDiscoveryHub.js';
import { SCHEMA_DDL } from './adapter/schema.js';
import {
    saveToOpfs,
    loadFromOpfs,
    deleteFromOpfs,
    migrateFromLocalStorage,
    getStorageEstimate,
    isOpfsSupported
} from './adapter/opfsStorage.js';
import {
    checkPageScrapeStatus,
    persistSemanticScrape
} from './scraper/semanticScraper.js';

let db: any;
let core: CuratorWasmCore = new CuratorWasmCore();


interface DbRegistry {
    activeId: string;
    databases: { id: string; name: string }[];
}

let currentDbId = 'default';
let dbReadyPromise: Promise<void>;

async function getDbRegistry(): Promise<DbRegistry> {
    const storage = await chrome.storage.local.get('curator_db_registry');
    if (storage['curator_db_registry']) {
        return storage['curator_db_registry'] as DbRegistry;
    }
    const defaultRegistry: DbRegistry = {
        activeId: 'default',
        databases: [{ id: 'default', name: 'Default Database' }]
    };
    await chrome.storage.local.set({ 'curator_db_registry': defaultRegistry });
    return defaultRegistry;
}

async function setDbRegistry(registry: DbRegistry): Promise<void> {
    await chrome.storage.local.set({ 'curator_db_registry': registry });
}

// Helper to convert Uint8Array to Base64 (safe for chrome storage)
function uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// Helper to convert Base64 back to Uint8Array
function base64ToUint8Array(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

// Persist SQLite state directly to OPFS binary file (or fallback to chrome.storage.local)
async function persistDatabase() {
    if (!db) return;
    try {
        const binaryArray = db.export();
        if (isOpfsSupported()) {
            await saveToOpfs(currentDbId, binaryArray);
            console.log(`[Curator Extension] Database state persisted to OPFS (curator_${currentDbId}.sqlite3: ${binaryArray.byteLength} bytes).`);
        } else {
            const base64 = uint8ArrayToBase64(binaryArray);
            const storageKey = currentDbId === 'default' ? 'curator_sqlite_db' : `curator_sqlite_db_${currentDbId}`;
            await chrome.storage.local.set({ [storageKey]: base64 });
            console.log(`[Curator Extension] Database state persisted to fallback storage (${storageKey}).`);
        }
    } catch (err) {
        console.error('[Curator Extension] Database persistence failed:', err);
    }
}

// Helper to append debugging logs
async function logEvent(level: 'INFO' | 'WARN' | 'ERROR', type: string, message: string, detail?: any) {
    try {
        const storage = await chrome.storage.local.get('curator_debug_logs');
        const logs = storage['curator_debug_logs'] ? JSON.parse(storage['curator_debug_logs']) : [];

        const newLog = {
            timestamp: new Date().toISOString(),
            level,
            type,
            message,
            detail: detail ? (typeof detail === 'string' ? detail : JSON.stringify(detail)) : null
        };

        logs.unshift(newLog);
        if (logs.length > 100) {
            logs.pop();
        }

        await chrome.storage.local.set({ 'curator_debug_logs': JSON.stringify(logs) });
    } catch (err) {
        console.error('[Curator Extension] Log append failed:', err);
    }
}

// Ensure persistent Offscreen Document exists for OPFS and background workers
async function ensureOffscreenDocument(): Promise<void> {
    if (typeof chrome.offscreen === 'undefined') return;
    try {
        if (typeof chrome.offscreen.hasDocument === 'function') {
            const hasDoc = await chrome.offscreen.hasDocument();
            if (hasDoc) return;
        }
    } catch {
        // hasDocument might throw if unsupported
    }

    try {
        await chrome.offscreen.createDocument({
            url: 'dist/offscreen.html',
            reasons: [chrome.offscreen.Reason.BLOBS, chrome.offscreen.Reason.LOCAL_STORAGE],
            justification: 'Persistent OPFS SQLite storage and worker execution for Curator'
        });
        console.log('[Curator Extension] Offscreen Document created successfully.');
    } catch (err: any) {
        console.warn('[Curator Extension] Note on offscreen document creation:', err?.message || err);
    }
}

// Initialize SQLite WASM & Prisma Client
async function initDatabase() {
    console.log('[Curator Extension] Initializing SQLite WASM...');
    await logEvent('INFO', 'SYSTEM', 'Initializing SQLite WASM database...');

    // Boot offscreen document asynchronously
    ensureOffscreenDocument().catch(() => {});

    const registry = await getDbRegistry();
    currentDbId = registry.activeId;

    // Pre-fetch sql-wasm.wasm to prevent internal XMLHttpRequest loading in background service worker
    const wasmUrl = chrome.runtime.getURL('dist/sql-wasm.wasm');
    const wasmResponse = await fetch(wasmUrl);
    const wasmBinary = await wasmResponse.arrayBuffer();

    // Initialize using the pre-fetched binary array buffer
    const SQL = await initSqlJs({
        wasmBinary
    });

    // 1. Try loading directly from OPFS binary storage
    let bytes: Uint8Array | null = await loadFromOpfs(currentDbId);

    // 2. If not yet in OPFS, check if legacy Base64 exists in chrome.storage.local and migrate
    if (!bytes) {
        bytes = await migrateFromLocalStorage(currentDbId);
    }

    if (bytes) {
        console.log(`[Curator Extension] Restoring existing database state from OPFS (${bytes.byteLength} bytes)...`);
        await logEvent('INFO', 'SYSTEM', `Restored SQLite database from OPFS for project ${currentDbId} (${bytes.byteLength} bytes)...`);
        db = new SQL.Database(bytes);
    } else {
        console.log(`[Curator Extension] Creating a new SQLite database in-memory for project ${currentDbId}...`);
        await logEvent('INFO', 'SYSTEM', `Creating a new in-memory SQLite database instance for ${currentDbId}...`);
        db = new SQL.Database();

        // Execute DDL to create tables
        console.log('[Curator Extension] Running SCHEMA DDL...');
        db.run(SCHEMA_DDL);

        // Seed default user, system project, etc.
        console.log('[Curator Extension] Seeding initial data...');
        await logEvent('INFO', 'SYSTEM', 'Seeding database tables with initial stub data...');
        db.run(`
            INSERT OR IGNORE INTO "User" (id, email, name, createdAt, updatedAt) 
            VALUES ('curator-extension-user', 'curator@arula.dev', 'curator', strftime('%Y-%m-%d %H:%M:%f', 'now'), strftime('%Y-%m-%d %H:%M:%f', 'now'));

            INSERT OR IGNORE INTO "Project" (id, name, userId, existent, createdAt, updatedAt)
            VALUES ('system', 'System Project', 'curator-extension-user', 1, strftime('%Y-%m-%d %H:%M:%f', 'now'), strftime('%Y-%m-%d %H:%M:%f', 'now'));

            INSERT OR IGNORE INTO "AIModel" (id, shortName, name, provider, type, version, url, deletedAt, existent, createdAt)
            VALUES 
            (1, 'gemini-2.5-flash', 'Gemini 2.5 Flash', 'google', 'TEXT', '2.5', 'https://generativelanguage.googleapis.com', NULL, 1, strftime('%Y-%m-%d %H:%M:%f', 'now')),
            (2, 'local-gemma', 'Local Gemma 3 1B', 'local', 'TEXT', '3', 'http://localhost:8080', NULL, 1, strftime('%Y-%m-%d %H:%M:%f', 'now'));

            INSERT OR IGNORE INTO "Script" (id, name, body, ast, userId, projectId, existent)
            VALUES (
                101,
                'web_scraper_workflow',
                '# Web Scrape Agent AST\nseq [ call_tool "browser_scrape_page", call_tool "persist_semantic_resource" ]',
                '{"type":"Sequence","nodes":[{"type":"ToolTask","toolName":"browser_scrape_page"},{"type":"ToolTask","toolName":"persist_semantic_resource"}]}',
                'curator-extension-user',
                'system',
                1
            );

            INSERT OR IGNORE INTO "Agent" (id, name, scriptId, schedule, userId, projectId, enabled, existent)
            VALUES (
                'agent_web_scraper',
                'Web Scraper & Knowledge Synthesizer',
                101,
                'on_demand',
                'curator-extension-user',
                'system',
                1,
                1
            );
        `);

        // Save immediately to OPFS
        await persistDatabase();
    }

    const extensionResolvers = {
        Query: {
            projects: async () => {
                const registry = await getDbRegistry();
                return registry.databases;
            },
            storageInfo: async () => {
                return await getStorageEstimate();
            }
        },
        Mutation: {
            createProject: async (_parent: any, { name }: { name: string }) => {
                await createDatabase(name);
                const registry = await getDbRegistry();
                return registry.databases[registry.databases.length - 1];
            },
            deleteProject: async (_parent: any, { id }: { id: string }) => {
                await deleteDatabase(id);
                return true;
            }
        }
    };

    await core.init({
        db,
        defaultUserId: 'curator-extension-user',
        defaultProjectId: currentDbId,
        customResolvers: extensionResolvers,
        onPersist: persistDatabase,
        onLog: (level, type, message, detail) => logEvent(level, type, message, detail)
    });

    console.log('[Curator Extension] Curator WASM Core initialized successfully!');
    await logEvent('INFO', 'SYSTEM', `Curator Core ready (OPFS: ${isOpfsSupported() ? 'enabled' : 'fallback'}).`);
}

// Start database — store promise so any handler can await full initialisation
dbReadyPromise = initDatabase().catch(err => {
    console.error('[Curator Extension] Boot failed:', err);
});

async function switchDatabase(newId: string) {
    const registry = await getDbRegistry();
    if (!registry.databases.find(db => db.id === newId)) {
        throw new Error(`Database ${newId} not found`);
    }
    registry.activeId = newId;
    await setDbRegistry(registry);
    dbReadyPromise = initDatabase().catch(err => {
        console.error('[Curator Extension] Switch DB boot failed:', err);
    });

    // Notify all open tabs of active project change
    chrome.tabs.query({}, (tabs) => {
        for (const t of tabs) {
            if (t.id) {
                chrome.tabs.sendMessage(t.id, {
                    type: 'ACTIVE_PROJECT_CHANGED',
                    projectId: newId
                }).catch(() => {});
            }
        }
    });

    return dbReadyPromise;
}

async function createDatabase(name: string) {
    const registry = await getDbRegistry();
    const newId = `db_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    registry.databases.push({ id: newId, name });
    registry.activeId = newId;
    await setDbRegistry(registry);
    dbReadyPromise = initDatabase().catch(err => {
        console.error('[Curator Extension] Create DB boot failed:', err);
    });
    return dbReadyPromise;
}

async function deleteDatabase(id: string) {
    if (id === 'default') {
        throw new Error('Cannot delete default database');
    }
    const registry = await getDbRegistry();
    registry.databases = registry.databases.filter(db => db.id !== id);
    if (registry.activeId === id) {
        registry.activeId = 'default';
    }
    await setDbRegistry(registry);
    await deleteFromOpfs(id);
    await chrome.storage.local.remove(`curator_sqlite_db_${id}`);
    
    dbReadyPromise = initDatabase().catch(err => {
        console.error('[Curator Extension] Delete DB boot failed:', err);
    });
    return dbReadyPromise;
}

// Open Curator Studio as a full browser tab when the toolbar icon is clicked.
// If a Curator tab is already open, focus it instead of creating a duplicate.
const CURATOR_PAGE = chrome.runtime.getURL('dist/popup/index.html');

async function openCuratorTab(resourceId?: number) {
    const targetUrl = resourceId ? `${CURATOR_PAGE}#/resource/${resourceId}` : CURATOR_PAGE;
    const tabs = await chrome.tabs.query({});
    const existing = tabs.find(t => t.url && t.url.startsWith(CURATOR_PAGE));
    if (existing && existing.id != null) {
        await chrome.tabs.update(existing.id, { url: targetUrl, active: true });
        if (existing.windowId != null) {
            await chrome.windows.update(existing.windowId, { focused: true });
        }
    } else {
        await chrome.tabs.create({ url: targetUrl });
    }
}

chrome.action.onClicked.addListener(async () => {
    await openCuratorTab();
});

// Setup messaging listener for GraphQL request routing.
// Returns true immediately so Chrome keeps the sendResponse port open,
// then awaits dbReadyPromise before executing — this prevents the
// "still initializing" error when the popup opens before the WASM DB boots.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'GRAPHQL_REQUEST') {
        const { query, variables, activeProjectId, userId = 'curator-extension-user' } = message.payload;

        console.log('[Curator Extension] Intercepted GraphQL Request:', query, variables);

        (async () => {
            // Wait for full DB + Prisma + schema initialisation before proceeding.
            await dbReadyPromise;

            // Switch database if client requested a different active project
            if (activeProjectId && activeProjectId !== currentDbId) {
                console.log(`[Curator Extension] Auto-switching database to match active project ID: ${activeProjectId}`);
                await switchDatabase(activeProjectId);
            }

            await logEvent('INFO', 'GRAPHQL_REQUEST', `Query: ${query.trim().split('\n')[0]}...`, { query, variables });

            try {
                const result = await core.handleGraphQL({
                    query,
                    variables,
                    activeProjectId: currentDbId,
                    userId
                });

                if (result.errors?.length) {
                    await logEvent('ERROR', 'GRAPHQL_RESPONSE', `GraphQL returned ${result.errors.length} errors`, result.errors);
                } else {
                    await logEvent('INFO', 'GRAPHQL_RESPONSE', 'Query completed successfully');
                }

                sendResponse(result);
            } catch (err: any) {
                console.error('[Curator Extension] GraphQL execution error:', err);
                await logEvent('ERROR', 'EXCEPTION', `GraphQL exception: ${err.message}`, err.stack);
                sendResponse({ errors: [{ message: err.message }] });
            }
        })();

        return true; // Keep the message channel open for the async response
    }
});

// Register Chrome Context Menu items on installation
chrome.runtime.onInstalled.addListener(() => {
    // Remove existing menus to prevent duplication errors on reloads
    chrome.contextMenus.removeAll(() => {
        // Parent menu item
        chrome.contextMenus.create({
            id: 'curator-parent',
            title: 'Curator',
            contexts: ['link', 'page']
        });

        // Sub-items
        chrome.contextMenus.create({
            id: 'add-resource',
            parentId: 'curator-parent',
            title: 'Add Resource',
            contexts: ['link', 'page']
        });
        chrome.contextMenus.create({
            id: 'scrape-resource',
            parentId: 'curator-parent',
            title: 'Scrape Resource',
            contexts: ['link', 'page']
        });
        chrome.contextMenus.create({
            id: 'open-resource',
            parentId: 'curator-parent',
            title: 'Open Resource',
            contexts: ['link', 'page']
        });

        console.log('[Curator Extension] Context menus registered successfully.');
    });
});

// Handle Context Menu item clicks — awaits dbReadyPromise so Prisma + schema
// are guaranteed to be initialised before the GraphQL mutation runs.
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    // Wait for full DB + Prisma + schema initialisation
    await dbReadyPromise;
    
    const url = info.linkUrl || info.pageUrl || '';
    let title = '';
    if (info.linkUrl) {
        title = info.selectionText || info.linkUrl;
    } else {
        title = tab?.title || info.pageUrl || '';
    }

    if (!url) return;

    console.log(`[Curator Extension] Context Menu action triggered: ${info.menuItemId} for ${url}`);
    logEvent('INFO', 'CONTEXT_MENU', `Context menu action ${info.menuItemId} triggered for: ${url}`);

    if (!core) {
        console.error('[Curator Extension] DB init failed — core unavailable.');
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'src/popup/icon128.png',
            title: 'Curator: Initialisation Failed',
            message: 'Could not connect to the local database. Check extension logs.'
        });
        return;
    }

    let query = '';
    let variables: any = {};

    if (info.menuItemId === 'add-resource') {
        query = `
            mutation AddResourceFromContextMenu($input: ResourceInput!) {
                upsertResource(input: $input) {
                    id
                    uri
                    title
                }
            }
        `;
        variables = {
            input: {
                uri: url,
                title: title,
                description: `Added via Curator context menu on ${new Date().toLocaleDateString()}`
            }
        };
    } else if (info.menuItemId === 'scrape-resource' || info.menuItemId === 'open-resource') {
        query = `
            mutation ScrapeResourceFromContextMenu($url: String!, $resourceUri: String) {
                scrapeResource(url: $url, resourceUri: $resourceUri) {
                    id
                    uri
                    title
                }
            }
        `;
        variables = {
            url,
            resourceUri: url
        };
    } else {
        return;
    }

    try {
        const result = await core.handleGraphQL({
            query,
            variables,
            userId: 'curator-extension-user',
            activeProjectId: currentDbId
        });

        if (result.errors && result.errors.length > 0) {
            const errMsg = result.errors[0].message;
            console.error('[Curator Extension] Context menu mutation failed:', result.errors);
            await logEvent('ERROR', 'CONTEXT_MENU', `Action failed: ${errMsg}`, result.errors);
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'src/popup/icon128.png',
                title: 'Curator Action Failed',
                message: errMsg
            });
        } else {
            console.log('[Curator Extension] Action succeeded:', result.data);
            const resObj = result.data?.upsertResource || result.data?.scrapeResource;
            await logEvent('INFO', 'CONTEXT_MENU', `Action succeeded: ${url}`, result.data);
            await persistDatabase();
            
            // Notify frontend
            chrome.runtime.sendMessage({ type: 'RESOURCE_ADDED', payload: resObj }).catch(() => {
               // Ignore error if popup is closed
            });
            
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'src/popup/icon128.png',
                title: 'Curator: Action Completed ✓',
                message: `"${resObj?.title || title || url}" has been processed.`
            });

            if (info.menuItemId === 'open-resource' && resObj?.id) {
                await openCuratorTab(resObj.id);
            }
        }
    } catch (err: any) {
        console.error('[Curator Extension] GraphQL exception in context menu handler:', err);
        await logEvent('ERROR', 'EXCEPTION', `GraphQL exception in context menu: ${err.message}`, err.stack);
    }
});

// ==========================================
// Curator Browser Relay Worker
// ==========================================

function waitForTabLoad(tabId: number, timeoutMs = 20000): Promise<void> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve(); // Resolve on timeout to allow partial DOM extraction
        }, timeoutMs);

        function listener(updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) {
            if (updatedTabId === tabId && changeInfo.status === 'complete') {
                clearTimeout(timer);
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
            }
        }
        chrome.tabs.onUpdated.addListener(listener);
    });
}

async function waitForSelectorInTab(tabId: number, selector: string, timeoutMs = 10000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const [res] = await chrome.scripting.executeScript({
                target: { tabId },
                func: (sel: string) => !!document.querySelector(sel),
                args: [selector]
            });
            if (res.result) return;
        } catch {
            // Tab might be navigating
        }
        await new Promise(r => setTimeout(r, 300));
    }
}

export async function extractRenderedPage(url: string, waitForSelector?: string): Promise<{
    url: string;
    title: string;
    html: string;
    text: string;
    meta: Record<string, string>;
}> {
    const tab = await chrome.tabs.create({ url, active: false });
    if (!tab.id) throw new Error('[Curator Extension] Failed to create background tab.');

    try {
        await waitForTabLoad(tab.id);

        if (waitForSelector) {
            await waitForSelectorInTab(tab.id, waitForSelector);
        }

        const [injection] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const meta: Record<string, string> = {};
                document.querySelectorAll('meta').forEach(el => {
                    const name = el.getAttribute('name') || el.getAttribute('property');
                    const content = el.getAttribute('content');
                    if (name && content) meta[name] = content;
                });
                return {
                    title: document.title || '',
                    html: document.documentElement.outerHTML,
                    text: document.body ? document.body.innerText : '',
                    meta
                };
            }
        });

        const res = (injection?.result || {}) as any;
        return {
            url,
            title: res.title || '',
            html: res.html || '',
            text: res.text || '',
            meta: res.meta || {}
        };
    } finally {
        if (tab.id) {
            await chrome.tabs.remove(tab.id).catch(() => {});
        }
    }
}

// Listen for Browser Relay extraction requests via Chrome message bus or popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'BROWSER_RELAY_EXTRACT') {
        const { url, waitForSelector } = message.payload || {};
        if (!url) {
            sendResponse({ error: 'url is required' });
            return true;
        }

        extractRenderedPage(url, waitForSelector)
            .then(data => sendResponse({ status: 'ok', data }))
            .catch(err => sendResponse({ status: 'error', error: err.message }));

        return true; // Asynchronous sendResponse
    }
});

console.log('[Curator Extension] Browser Relay Worker active and ready for background scraping.');

// ==========================================
// Curator P2P Federation & Discovery Hub
// ==========================================

async function executeExtensionTool(toolName: string, args: Record<string, unknown>): Promise<any> {
    if (toolName === 'browser_get_active_tab') {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab) throw new Error('No active browser tab found.');
        return {
            id: activeTab.id,
            url: activeTab.url || '',
            title: activeTab.title || '',
            favIconUrl: activeTab.favIconUrl || ''
        };
    }

    if (toolName === 'browser_scrape_page') {
        const targetUrl = args.url as string | undefined;
        const waitForSelector = args.waitForSelector as string | undefined;

        if (targetUrl) {
            return await extractRenderedPage(targetUrl, waitForSelector);
        }

        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab || !activeTab.id) throw new Error('No active tab available to scrape.');

        const [injection] = await chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            func: () => {
                const meta: Record<string, string> = {};
                document.querySelectorAll('meta').forEach(el => {
                    const name = el.getAttribute('name') || el.getAttribute('property');
                    const content = el.getAttribute('content');
                    if (name && content) meta[name] = content;
                });
                return {
                    title: document.title || '',
                    html: document.documentElement.outerHTML,
                    text: document.body ? document.body.innerText : '',
                    meta
                };
            }
        });

        const res = (injection?.result || {}) as any;
        return {
            url: activeTab.url || '',
            title: res.title || '',
            html: res.html || '',
            text: res.text || '',
            meta: res.meta || {}
        };
    }

    if (toolName === 'browser_capture_viewport') {
        const dataUrl = await chrome.tabs.captureVisibleTab(undefined as any, { format: 'png' });
        return { screenshot: dataUrl };
    }

    if (toolName === 'curator_search_knowledge') {
        await dbReadyPromise;
        const result = await core.handleGraphQL({
            query: `
                query SearchResources($term: String) {
                    resources(filter: { title: $term }) {
                        id
                        title
                        uri
                        description
                        createdAt
                    }
                }
            `,
            variables: { term: (args.query as string) || '' },
            activeProjectId: currentDbId
        });
        return result.data?.resources || [];
    }

    if (toolName === 'curator_get_storage_info') {
        const estimate = await getStorageEstimate();
        return {
            ...estimate,
            activeDb: currentDbId
        };
    }

    throw new Error(`Unknown extension tool: "${toolName}"`);
}

export const peerHub = new PeerDiscoveryHub({
    hubId: 'chrome-extension',
    name: 'Curator Chrome Extension Hub',
    localTools: [
        {
            name: 'browser_get_active_tab',
            description: 'Get details of the currently active browser tab (URL, title, tab ID)',
            parameters: { type: 'object', properties: {} }
        },
        {
            name: 'browser_scrape_page',
            description: 'Extract readable HTML, text content, and metadata from a given URL or active tab',
            parameters: {
                type: 'object',
                properties: {
                    url: { type: 'string', description: 'Target URL. If omitted, scrapes the active tab.' },
                    waitForSelector: { type: 'string', description: 'CSS selector to wait for before scraping.' }
                }
            }
        },
        {
            name: 'browser_capture_viewport',
            description: 'Capture screenshot of the currently visible browser viewport as PNG Base64',
            parameters: { type: 'object', properties: {} }
        },
        {
            name: 'curator_search_knowledge',
            description: 'Query the local Curator WASM SQLite knowledge base for resources and entities',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Search keywords or title' },
                    limit: { type: 'number', description: 'Maximum items to return' }
                },
                required: ['query']
            }
        },
        {
            name: 'curator_get_storage_info',
            description: 'Get storage engine statistics (OPFS status, disk usage bytes, quota)',
            parameters: { type: 'object', properties: {} }
        }
    ],
    onLog: (level, type, message, detail) => logEvent(level, type, message, detail),
    executeLocalTool: async (toolName, args) => {
        return executeExtensionTool(toolName, args);
    }
});

// Connect content script bridges and external ports
chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'curator-peer-bridge') {
        peerHub.handlePortConnection(port);
    }
});

// Handle P2P inspection queries from extension popup or internal pages
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'STORAGE_INFO') {
        getStorageEstimate().then(info => sendResponse(info));
        return true;
    }
    if (message?.type === 'PEER_LIST') {
        sendResponse({ peers: peerHub.listPeers() });
        return true;
    }
    if (message?.type === 'PEER_TOOLS') {
        sendResponse({ tools: peerHub.listAllFederatedTools() });
        return true;
    }
    if (message?.type === 'CALL_FEDERATED_TOOL') {
        peerHub.callRemoteTool(message.peerId, message.toolName, message.args || {})
            .then(result => sendResponse({ status: 'ok', result }))
            .catch(err => sendResponse({ status: 'error', error: err?.message || String(err) }));
        return true;
    }
    if (message?.type === 'CHECK_PAGE_SCRAPE_STATUS') {
        (async () => {
            await dbReadyPromise;
            const registry = await getDbRegistry();
            const activeProject = registry.databases.find(d => d.id === currentDbId)?.name || 'Default';
            const status = checkPageScrapeStatus(db, message.url);
            sendResponse({
                ...status,
                projectId: currentDbId,
                projectName: activeProject
            });
        })();
        return true;
    }
    if (message?.type === 'TRIGGER_PAGE_SCRAPE') {
        (async () => {
            try {
                await dbReadyPromise;
                const { url, title } = message;

                // Extract data from the page
                let extracted: any;
                const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                const currentTab = tabs[0];

                if (currentTab?.id && currentTab.url === url) {
                    const [injection] = await chrome.scripting.executeScript({
                        target: { tabId: currentTab.id },
                        func: () => {
                            const meta: Record<string, string> = {};
                            document.querySelectorAll('meta').forEach(el => {
                                const name = el.getAttribute('name') || el.getAttribute('property');
                                const content = el.getAttribute('content');
                                if (name && content) meta[name] = content;
                            });
                            return {
                                url: window.location.href,
                                title: document.title || '',
                                text: document.body ? document.body.innerText : '',
                                meta
                            };
                        }
                    });
                    extracted = injection?.result;
                } else {
                    extracted = await extractRenderedPage(url);
                }

                if (!extracted) throw new Error('Could not extract page content');

                // Persist into active OPFS SQLite database
                const result = await persistSemanticScrape(db, {
                    url: extracted.url || url,
                    title: extracted.title || title || url,
                    text: extracted.text || '',
                    meta: extracted.meta || {}
                }, currentDbId);

                await persistDatabase();

                // Broadcast update to tabs
                chrome.tabs.query({}, (tabList) => {
                    for (const t of tabList) {
                        if (t.id) {
                            chrome.tabs.sendMessage(t.id, {
                                type: 'PAGE_SCRAPE_UPDATED',
                                url: extracted.url || url,
                                resourceId: result.resourceId,
                                updatedAt: new Date().toISOString()
                            }).catch(() => {});
                        }
                    }
                });

                sendResponse({ status: 'ok', resourceId: result.resourceId, title: result.title });
            } catch (err: any) {
                console.error('[Curator Extension] Scrape failed:', err);
                sendResponse({ status: 'error', error: err?.message || String(err) });
            }
        })();
        return true;
    }
    if (message?.type === 'OPEN_CURATOR_STUDIO') {
        openCuratorTab(message.resourceId).catch(console.error);
        sendResponse({ status: 'ok' });
        return true;
    }
    if (message?.type === 'BROADCAST_MESH_EVENT') {
        peerHub.broadcastEvent(message.envelope);
        sendResponse({ status: 'ok' });
        return true;
    }
});

console.log('[Curator Extension] PeerDiscoveryHub active. In-browser P2P mesh listening on curator-peer-bridge.');

// ==========================================
// Desktop MCP Bridge Client Loop
// ==========================================

function initMcpBridgeClient(port = 8765) {
    let bridgeSocket: WebSocket | null = null;
    let retryTimer: any = null;

    function connect() {
        try {
            bridgeSocket = new WebSocket(`ws://127.0.0.1:${port}`);

            bridgeSocket.onopen = () => {
                console.log('[Curator Extension] Connected to desktop MCP runner.');
                const allTools = peerHub.listAllFederatedTools();
                bridgeSocket?.send(JSON.stringify({
                    type: 'REGISTER_TOOLS',
                    tools: allTools
                }));
            };

            bridgeSocket.onmessage = async (event) => {
                try {
                    const msg = JSON.parse(event.data.toString());
                    if (msg.type === 'CALL_TOOL') {
                        const { callId, toolName, args } = msg;
                        try {
                            let targetPeerId = 'chrome-extension';
                            let actualToolName = toolName;
                            if (toolName.includes(':')) {
                                const parts = toolName.split(':');
                                targetPeerId = parts[0];
                                actualToolName = parts.slice(1).join(':');
                            }
                            const result = await peerHub.callRemoteTool(targetPeerId, actualToolName, args || {});
                            bridgeSocket?.send(JSON.stringify({
                                type: 'TOOL_RESPONSE',
                                callId,
                                result
                            }));
                        } catch (err: any) {
                            bridgeSocket?.send(JSON.stringify({
                                type: 'TOOL_RESPONSE',
                                callId,
                                error: err?.message || String(err)
                            }));
                        }
                    }
                } catch (err) {
                    console.error('[Curator Extension] MCP message handling error:', err);
                }
            };

            bridgeSocket.onclose = () => {
                bridgeSocket = null;
                scheduleRetry();
            };

            bridgeSocket.onerror = () => {
                bridgeSocket?.close();
            };
        } catch {
            scheduleRetry();
        }
    }

    function scheduleRetry() {
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = setTimeout(() => {
            connect();
        }, 5000);
    }

    connect();
}

// Start connecting to Desktop MCP Bridge
initMcpBridgeClient();



