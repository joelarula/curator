// GraphQL template queries
const GRAPHQL_TEMPLATES = {
    getStats: `query GetStats {
  resources {
    items {
      id
      uri
      title
    }
    totalCount
  }
}`,
    getResources: `query GetResources {
  resources {
    items {
      id
      uri
      title
      description
      isPublished
      createdAt
    }
    totalCount
  }
}`,
    getTools: `query GetTools {
  tools {
    id
    name
    description
    version
    enabled
  }
}`,
    createResource: `mutation CreateResource {
  upsertResource(input: { uri: "https://wikipedia.org", title: "Wikipedia Homepage" }) {
    id
    uri
    title
  }
}`
};

// Elements
const tabs = document.querySelectorAll('.tab-btn');
const panes = document.querySelectorAll('.pane');
const graphqlSelect = document.getElementById('graphql-select');
const graphqlInput = document.getElementById('graphql-input');
const graphqlOut = document.getElementById('graphql-out');
const graphqlStatus = document.getElementById('console-status');
const btnGraphqlRun = document.getElementById('btn-graphql-run');

const statResources = document.getElementById('stat-resources');
const statRelations = document.getElementById('stat-relations');
const statTexts = document.getElementById('stat-texts');
const resourcesList = document.getElementById('resources-list');

// Tab Navigation
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        panes.forEach(p => p.classList.remove('active'));

        tab.classList.add('active');
        const activePane = document.getElementById(tab.dataset.tab);
        if (activePane) {
            activePane.classList.add('active');
        }
        if (tab.dataset.tab === 'tab-logs') {
            updateLogs();
        }
    });
});

// Set template on select change
graphqlSelect.addEventListener('change', (e) => {
    const template = GRAPHQL_TEMPLATES[e.target.value];
    if (template) {
        graphqlInput.value = template;
    }
});

// Set default template
graphqlInput.value = GRAPHQL_TEMPLATES.getStats;

// Query background script via Message Passing
function queryGraphQL(query, variables = {}) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            type: 'GRAPHQL_REQUEST',
            payload: { query, variables }
        }, (response) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve(response);
            }
        });
    });
}

// Execute Query Action
async function executeQuery() {
    const queryStr = graphqlInput.value.trim();
    if (!queryStr) return;

    graphqlStatus.textContent = 'Executing...';
    graphqlStatus.style.color = 'var(--text-muted)';
    graphqlOut.classList.remove('error');

    try {
        const response = await queryGraphQL(queryStr);
        graphqlOut.textContent = JSON.stringify(response, null, 2);
        
        if (response.errors) {
            graphqlStatus.textContent = 'Error';
            graphqlStatus.style.color = 'var(--danger)';
            graphqlOut.classList.add('error');
        } else {
            graphqlStatus.textContent = 'Success';
            graphqlStatus.style.color = 'var(--success)';
            // Refresh counts/data
            updateStats();
        }
    } catch (err) {
        graphqlStatus.textContent = 'Failed';
        graphqlStatus.style.color = 'var(--danger)';
        graphqlOut.textContent = `Extension message passing failed:\n${err.message}`;
        graphqlOut.classList.add('error');
    }
}

btnGraphqlRun.addEventListener('click', executeQuery);

// Fetch stats and update UI cards
async function updateStats() {
    try {
        // Query resources list and count
        const response = await queryGraphQL(`
            query GetStats {
                resources {
                    items {
                        id
                        uri
                        title
                        description
                    }
                    totalCount
                }
            }
        `);

        if (response && response.data && response.data.resources) {
            const connection = response.data.resources;
            const resources = connection.items || [];
            statResources.textContent = connection.totalCount !== undefined ? connection.totalCount : resources.length;
            
            // Build the local data list view
            if (resources.length === 0) {
                resourcesList.innerHTML = `<div class="item-subtitle" style="text-align: center; padding: 20px 0;">No resources found. Try creating one!</div>`;
            } else {
                resourcesList.innerHTML = resources.map(res => `
                    <div class="list-item">
                        <div class="item-meta">
                            <span class="item-title">${res.title || 'Untitled'}</span>
                            <span class="item-subtitle">${res.uri}</span>
                        </div>
                    </div>
                `).join('');
            }
        } else {
            statResources.textContent = '0';
        }

        // Set default relation/text counts (mocked or loaded if resolvers support)
        statRelations.textContent = '0';
        statTexts.textContent = '0';

    } catch (err) {
        console.error('[Curator Extension] Stats update failed:', err);
    }
}

// Initial setup
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(updateStats, 1000); // Allow DB initialization time
});

// Elements for logging
const logsList = document.getElementById('logs-list');
const btnClearLogs = document.getElementById('btn-clear-logs');
const btnDownloadLogs = document.getElementById('btn-download-logs');

// Load logs from storage and render them
async function updateLogs() {
    try {
        const storage = await chrome.storage.local.get('curator_debug_logs');
        const logs = storage['curator_debug_logs'] ? JSON.parse(storage['curator_debug_logs']) : [];
        
        if (logs.length === 0) {
            logsList.innerHTML = `<div class="item-subtitle" style="text-align: center; padding: 20px 0; color: var(--text-muted);">No logs captured yet.</div>`;
            return;
        }
        
        logsList.innerHTML = logs.map(log => {
            const time = new Date(log.timestamp).toLocaleTimeString();
            const levelColor = log.level === 'ERROR' ? 'var(--danger)' : (log.level === 'WARN' ? 'orange' : 'var(--success)');
            return `
                <div style="border-bottom: 1px solid rgba(255,255,255,0.03); padding-bottom: 4px; margin-bottom: 4px; word-break: break-all;">
                    <span style="color: var(--text-muted); font-size: 8px;">${time}</span>
                    [<span style="color: ${levelColor}; font-weight: bold; font-size: 8px;">${log.level}</span>]
                    <span style="color: var(--primary); font-weight: 500;">${log.type}</span>: 
                    <span style="color: var(--text);">${log.message}</span>
                    ${log.detail ? `<pre style="margin-top: 4px; padding: 6px; background: rgba(0,0,0,0.4); border-radius: 4px; font-size: 8px; color: var(--text-muted); white-space: pre-wrap; word-break: break-all; border: 1px solid var(--border);">${typeof log.detail === 'string' ? log.detail : JSON.stringify(log.detail, null, 2)}</pre>` : ''}
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error('[Curator Extension] Logs update failed:', err);
    }
}

// Clear all logged events
btnClearLogs.addEventListener('click', async () => {
    await chrome.storage.local.set({ 'curator_debug_logs': JSON.stringify([]) });
    updateLogs();
});

// Download logs as a JSON file
btnDownloadLogs.addEventListener('click', async () => {
    try {
        const storage = await chrome.storage.local.get('curator_debug_logs');
        const logs = storage['curator_debug_logs'] ? storage['curator_debug_logs'] : '[]';
        
        const blob = new Blob([logs], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `curator_extension_debug_logs_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (err) {
        console.error('[Curator Extension] Logs download failed:', err);
    }
});
