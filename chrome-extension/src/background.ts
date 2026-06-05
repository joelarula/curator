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
import { graphql } from 'graphql';
import { makeExecutableSchema } from '@graphql-tools/schema';

// Import shared schema and resolvers
import { typeDefs } from '../../server/src/schema/index.js';
import { resolvers } from '../../server/src/resolvers/index.js';

// Import our custom WASM database adapter
import { SQLiteWasmAdapter } from './adapter/sqliteWasmAdapter.js';
import { SCHEMA_DDL } from './adapter/schema.ts';

// Import generated Prisma client for SQLite (edge/wasm target)
import { PrismaClient } from '../../server/src/generated/prisma-sqlite/edge.js';

let db: any;
let prisma: PrismaClient;
let schema: any;

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

// Persist SQLite state to chrome.storage.local
async function persistDatabase() {
    if (!db) return;
    try {
        const binaryArray = db.export();
        const base64 = uint8ArrayToBase64(binaryArray);
        const storageKey = currentDbId === 'default' ? 'curator_sqlite_db' : `curator_sqlite_db_${currentDbId}`;
        await chrome.storage.local.set({ [storageKey]: base64 });
        console.log(`[Curator Extension] Database state persisted successfully to ${storageKey}.`);
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

// Initialize SQLite WASM & Prisma Client
async function initDatabase() {
    console.log('[Curator Extension] Initializing SQLite WASM...');
    await logEvent('INFO', 'SYSTEM', 'Initializing SQLite WASM database...');

    const registry = await getDbRegistry();
    currentDbId = registry.activeId;
    const storageKey = currentDbId === 'default' ? 'curator_sqlite_db' : `curator_sqlite_db_${currentDbId}`;

    // Pre-fetch sql-wasm.wasm to prevent internal XMLHttpRequest loading in background service worker
    const wasmUrl = chrome.runtime.getURL('dist/sql-wasm.wasm');
    const wasmResponse = await fetch(wasmUrl);
    const wasmBinary = await wasmResponse.arrayBuffer();

    // Initialize using the pre-fetched binary array buffer
    const SQL = await initSqlJs({
        wasmBinary
    });

    // Check if there is an existing database state in storage
    const storage = await chrome.storage.local.get(storageKey);
    if (storage[storageKey]) {
        console.log(`[Curator Extension] Restoring existing database state from ${storageKey}...`);
        await logEvent('INFO', 'SYSTEM', `Restoring existing SQLite database state from ${storageKey}...`);
        const bytes = base64ToUint8Array(storage[storageKey]);
        db = new SQL.Database(bytes);
    } else {
        console.log(`[Curator Extension] Creating a new SQLite database in-memory for ${storageKey}...`);
        await logEvent('INFO', 'SYSTEM', `Creating a new in-memory SQLite database instance for ${storageKey}...`);
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
        `);

        // Save immediately
        await persistDatabase();
    }

    // Instanciate Prisma Client using the custom driver adapter
    const adapter = new SQLiteWasmAdapter(db);
    prisma = new PrismaClient({ adapter });

    // Build the executable GraphQL schema
    const extensionTypeDefs = `
      type DatabaseInfo {
        id: ID!
        name: String!
      }

      type DbRegistry {
        activeId: ID!
        databases: [DatabaseInfo!]!
      }

      extend type Query {
        dbRegistry: DbRegistry!
      }

      extend type Mutation {
        switchDatabase(id: ID!): Boolean!
        createDatabase(name: String!): Boolean!
        deleteDatabase(id: ID!): Boolean!
      }
    `;

    const extensionResolvers = {
        Query: {
            dbRegistry: async () => await getDbRegistry()
        },
        Mutation: {
            switchDatabase: async (_parent: any, { id }: { id: string }) => {
                await switchDatabase(id);
                return true;
            },
            createDatabase: async (_parent: any, { name }: { name: string }) => {
                await createDatabase(name);
                return true;
            },
            deleteDatabase: async (_parent: any, { id }: { id: string }) => {
                await deleteDatabase(id);
                return true;
            }
        }
    };

    schema = makeExecutableSchema({ 
        typeDefs: [typeDefs, extensionTypeDefs], 
        resolvers: [resolvers, extensionResolvers] 
    });

    console.log('[Curator Extension] In-memory GraphQL and SQLite WASM database initialized successfully!');
    await logEvent('INFO', 'SYSTEM', 'In-memory GraphQL & SQLite WASM database fully ready.');
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

let graphqlQueuePromise: Promise<void> = Promise.resolve();

async function enqueueGraphQL(query: string, variables: any, userId: string): Promise<any> {
    return new Promise((resolve) => {
        // Always chain with .catch(() => {}) so a prior rejection never breaks the queue
        graphqlQueuePromise = graphqlQueuePromise
            .catch(() => {}) // Ensure the chain continues even if the previous item rejected
            .then(async () => {
                try {
                    const res = await graphql({
                        schema,
                        source: query,
                        variableValues: variables,
                        contextValue: {
                            prisma,
                            user: { id: userId },
                            agentScheduler:    { getState: () => ({ isRunning: false, activeJobs: 0 }) },
                            requestProcessor:  { getState: () => ({ isRunning: false, requestsProcessed: 0 }) },
                        },
                    });
                    resolve(res);
                } catch (err: any) {
                    resolve({ errors: [{ message: err.message }] });
                }
            });
    });
}

// Setup messaging listener for GraphQL request routing.
// Returns true immediately so Chrome keeps the sendResponse port open,
// then awaits dbReadyPromise before executing — this prevents the
// "still initializing" error when the popup opens before the WASM DB boots.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'GRAPHQL_REQUEST') {
        const { query, variables, userId = 'curator-extension-user' } = message.payload;

        console.log('[Curator Extension] Intercepted GraphQL Request:', query, variables);

        // Handle the async work in an IIFE so we can use await while still
        // returning `true` synchronously to keep the message channel open.
        (async () => {
            // Wait for full DB + Prisma + schema initialisation before proceeding.
            await dbReadyPromise;

            await logEvent('INFO', 'GRAPHQL_REQUEST', `Query: ${query.trim().split('\n')[0]}...`, { query, variables });

            if (!schema || !prisma) {
                sendResponse({ errors: [{ message: 'Database initialisation failed. Check extension logs.' }] });
                return;
            }

            try {
                const result = await enqueueGraphQL(query, variables, userId);

                if (result.errors?.length) {
                    await logEvent('ERROR', 'GRAPHQL_RESPONSE', `GraphQL returned ${result.errors.length} errors`, result.errors);
                } else {
                    await logEvent('INFO', 'GRAPHQL_RESPONSE', 'Query completed successfully');
                }

                // Persist DB snapshot after any mutation
                if (/\bmutation\b/i.test(query)) {
                    await logEvent('INFO', 'SYSTEM', 'Mutation detected — persisting database…');
                    await persistDatabase();
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

    if (!schema || !prisma) {
        console.error('[Curator Extension] DB init failed — schema/prisma unavailable.');
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
        const result = await enqueueGraphQL(query, variables, 'curator-extension-user');

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
