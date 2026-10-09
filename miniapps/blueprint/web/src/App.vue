<template>
  <div class="blueprint-app">
    <!-- Masthead -->
    <header class="app-header">
      <div class="brand-section">
        <div class="logo-badge">⚡</div>
        <div>
          <h1 class="brand-title">Curator Blueprint</h1>
          <div class="brand-subtitle">Full-Stack MiniApp Starter &amp; Agent Orchestration</div>
        </div>
      </div>

      <div class="header-actions">
        <!-- Dev Console Trigger Pill -->
        <button
          class="console-pill-btn"
          :class="{ active: consoleOpen }"
          type="button"
          title="Open Curator Dev Console (Ctrl + `)"
          @click="consoleOpen = !consoleOpen"
        >
          <span class="pulse-dot"></span>
          <span>Curator Console</span>
          <kbd style="font-size: 0.7rem; opacity: 0.7; background: rgba(0,0,0,0.3); padding: 2px 4px; border-radius: 4px;">Ctrl+`</kbd>
        </button>
      </div>
    </header>

    <!-- Main Navigation & Workspace -->
    <main class="main-content">
      <nav class="nav-tabs">
        <button
          class="nav-tab-btn"
          :class="{ active: activeTab === 'agents' }"
          @click="activeTab = 'agents'"
        >
          🤖 Agent Playground
        </button>
        <button
          class="nav-tab-btn"
          :class="{ active: activeTab === 'tools' }"
          @click="activeTab = 'tools'"
        >
          🛠️ Tool Runner
        </button>
        <button
          class="nav-tab-btn"
          :class="{ active: activeTab === 'coffee' }"
          @click="activeTab = 'coffee'"
        >
          ☕ CoffeeScript AST
        </button>
        <button
          class="nav-tab-btn"
          :class="{ active: activeTab === 'federation' }"
          @click="activeTab = 'federation'"
        >
          🌐 P2P Federation
        </button>
        <button
          class="nav-tab-btn"
          :class="{ active: activeTab === 'graphql' }"
          @click="activeTab = 'graphql'"
        >
          📊 GraphQL API
        </button>
        <button
          class="nav-tab-btn"
          :class="{ active: activeTab === 'events' }"
          @click="activeTab = 'events'"
        >
          📡 Event Stream ({{ events.length }})
        </button>
      </nav>

      <!-- TAB 1: Agent Playground -->
      <section v-if="activeTab === 'agents'" class="grid-2col">
        <div class="glass-card">
          <h2 class="card-title">🤖 Active Agents</h2>
          <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1.5rem;">
            Agents defined in <code>src/plugins/demo.ts</code> registered on the Curator Host.
          </p>

          <div style="display: flex; flex-direction: column; gap: 1rem;">
            <div
              v-for="agent in agents"
              :key="agent.name"
              style="padding: 1rem; background: rgba(0,0,0,0.25); border-radius: 0.75rem; border: 1px solid var(--border-color);"
            >
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <strong style="font-size: 1rem; color: #ffffff;">{{ agent.name }}</strong>
                <span style="font-size: 0.75rem; padding: 2px 8px; border-radius: 12px; background: rgba(16,185,129,0.2); color: #10b981;">
                  {{ agent.enabled ? 'Enabled' : 'Disabled' }}
                </span>
              </div>
              <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.75rem;">
                {{ agent.description }}
              </p>
              <button
                class="btn-primary"
                :disabled="triggeringAgent === agent.name"
                @click="handleTriggerAgent(agent.name)"
              >
                {{ triggeringAgent === agent.name ? 'Executing...' : 'Trigger Run' }}
              </button>
            </div>
          </div>
        </div>

        <div class="glass-card">
          <h2 class="card-title">💬 Interactive Dialog Chat</h2>
          <div style="display: flex; flex-direction: column; height: 350px; justify-content: space-between;">
            <div style="overflow-y: auto; flex: 1; padding: 0.5rem; background: rgba(0,0,0,0.3); border-radius: 0.5rem; margin-bottom: 1rem;">
              <div v-if="chatMessages.length === 0" style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 2rem;">
                Trigger <code>dialog_playground</code> or type a message to start interactive turn loop.
              </div>
              <div
                v-for="(msg, idx) in chatMessages"
                :key="idx"
                :style="{
                  textAlign: msg.sender === 'user' ? 'right' : 'left',
                  margin: '0.5rem 0'
                }"
              >
                <div
                  :style="{
                    display: 'inline-block',
                    padding: '0.6rem 1rem',
                    borderRadius: '0.75rem',
                    background: msg.sender === 'user' ? '#4f46e5' : 'rgba(255,255,255,0.08)',
                    color: '#ffffff',
                    maxWidth: '80%',
                    fontSize: '0.9rem'
                  }"
                >
                  <div style="font-size: 0.7rem; opacity: 0.7; margin-bottom: 2px;">{{ msg.sender.toUpperCase() }}</div>
                  <div>{{ msg.text }}</div>
                </div>
              </div>
            </div>

            <div style="display: flex; gap: 0.5rem;">
              <input
                v-model="chatInput"
                type="text"
                placeholder="Type your response..."
                style="flex: 1; padding: 0.65rem 1rem; border-radius: 0.5rem; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); color: #fff;"
                @keyup.enter="sendChatMessage"
              />
              <button class="btn-primary" @click="sendChatMessage">Send</button>
            </div>
          </div>
        </div>
      </section>

      <!-- TAB 2: Tool Runner -->
      <section v-if="activeTab === 'tools'" class="grid-2col">
        <div class="glass-card">
          <h2 class="card-title">🛠️ Registered Tools</h2>
          <div style="display: flex; flex-direction: column; gap: 1rem;">
            <div
              v-for="tool in tools"
              :key="tool.name"
              style="padding: 1rem; background: rgba(0,0,0,0.25); border-radius: 0.75rem; border: 1px solid var(--border-color);"
            >
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <strong style="color: #6366f1;">{{ tool.name }}</strong>
                <span style="font-size: 0.75rem; color: var(--text-muted);">{{ tool.accessLevel || 'domain' }}</span>
              </div>
              <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.75rem;">
                {{ tool.description }}
              </p>
              <button class="btn-secondary" @click="selectToolForExecution(tool)">
                Load in Runner &rarr;
              </button>
            </div>
          </div>
        </div>

        <div class="glass-card">
          <h2 class="card-title">⚡ Tool Executor</h2>
          <div v-if="selectedTool">
            <h3 style="font-size: 1rem; margin-bottom: 0.5rem; color: #10b981;">Executing: {{ selectedTool.name }}</h3>
            <textarea
              v-model="toolArgsJson"
              rows="6"
              style="width: 100%; padding: 0.75rem; border-radius: 0.5rem; background: #07090e; border: 1px solid var(--border-color); color: #a5f3fc; font-family: monospace; font-size: 0.85rem; margin-bottom: 1rem;"
            ></textarea>
            <button class="btn-primary" :disabled="executingTool" @click="handleExecuteTool">
              {{ executingTool ? 'Executing...' : 'Run Tool' }}
            </button>

            <div v-if="toolResult" style="margin-top: 1rem;">
              <h4 style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.25rem;">Result:</h4>
              <pre style="background: #07090e; padding: 0.75rem; border-radius: 0.5rem; color: #a7f3d0; font-size: 0.8rem; overflow-x: auto;">{{ JSON.stringify(toolResult, null, 2) }}</pre>
            </div>
          </div>
          <div v-else style="color: var(--text-muted); padding: 2rem; text-align: center;">
            Select a tool from the left to configure arguments and run.
          </div>
        </div>
      </section>

      <!-- TAB 3: CoffeeScript AST Studio -->
      <section v-if="activeTab === 'coffee'" class="grid-2col">
        <div class="glass-card">
          <h2 class="card-title">☕ Natural Verbs DSL</h2>
          <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 0.75rem;">
            Write declarative workflows using <code>tool</code>, <code>seq</code>, <code>while_loop</code>, <code>set_state</code>.
          </p>
          <textarea
            v-model="coffeeCode"
            rows="12"
            style="width: 100%; padding: 0.75rem; border-radius: 0.5rem; background: #07090e; border: 1px solid var(--border-color); color: #fde047; font-family: monospace; font-size: 0.85rem; margin-bottom: 1rem;"
          ></textarea>
          <div style="display: flex; gap: 0.5rem;">
            <button class="btn-primary" @click="handleCompileCoffee">Compile to AST</button>
          </div>
        </div>

        <div class="glass-card">
          <h2 class="card-title">🌳 Compiled Execution AST</h2>
          <pre style="background: #07090e; padding: 1rem; border-radius: 0.5rem; height: 320px; overflow-y: auto; color: #38bdf8; font-size: 0.8rem;">{{ compiledAst ? JSON.stringify(compiledAst, null, 2) : '// Compiled AST JSON will appear here...' }}</pre>
        </div>
      </section>

      <!-- TAB 4: P2P Federation -->
      <section v-if="activeTab === 'federation'" class="glass-card">
        <h2 class="card-title">🌐 P2P Federated Mesh Status</h2>
        <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1.5rem;">
          Connects multiple independent Curator Hosts in a distributed mesh with remote MCP tool proxying and WebSocket event bus.
        </p>
        <div style="display: flex; gap: 1rem; margin-bottom: 1.5rem;">
          <button class="btn-primary" @click="handleTriggerP2P">Trigger P2P Ping-Pong Match</button>
        </div>
        <div class="event-log-container">
          <div v-for="(p2pLog, i) in p2pLogs" :key="i" class="event-item">
            <span class="event-time">{{ p2pLog.time }}</span>
            <span :style="{ color: p2pLog.color || '#38bdf8' }">{{ p2pLog.text }}</span>
          </div>
        </div>
      </section>

      <!-- TAB 5: GraphQL API Explorer -->
      <section v-if="activeTab === 'graphql'" class="grid-2col">
        <div class="glass-card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
            <h2 class="card-title" style="margin-bottom: 0;">📊 GraphQL Query / Mutation</h2>
            <button class="btn-secondary" style="font-size: 0.75rem; padding: 0.25rem 0.5rem;" @click="showSchema = !showSchema">
              {{ showSchema ? 'Hide Schema' : 'View Schema SDL' }}
            </button>
          </div>

          <div style="margin-bottom: 0.75rem;">
            <label style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-bottom: 0.25rem;">Preset Queries:</label>
            <select
              v-model="selectedPreset"
              style="width: 100%; padding: 0.5rem; border-radius: 0.5rem; background: #07090e; border: 1px solid var(--border-color); color: #67e8f9; font-size: 0.85rem;"
              @change="applyPreset"
            >
              <option value="metrics">System Metrics &amp; DB Health</option>
              <option value="tools_agents">List Registered Tools &amp; Agents</option>
              <option value="requests">Recent AST Requests &amp; Execution Trees</option>
              <option value="conversations">Conversations &amp; Turns</option>
              <option value="exec_tool">Mutation: Execute Tool</option>
              <option value="trigger_agent">Mutation: Trigger Agent</option>
            </select>
          </div>

          <textarea
            v-model="graphqlQuery"
            rows="10"
            style="width: 100%; padding: 0.75rem; border-radius: 0.5rem; background: #07090e; border: 1px solid var(--border-color); color: #a5f3fc; font-family: monospace; font-size: 0.85rem; margin-bottom: 0.75rem;"
          ></textarea>

          <div style="display: flex; gap: 0.5rem;">
            <button class="btn-primary" :disabled="executingGql" @click="handleExecuteGraphql">
              {{ executingGql ? 'Executing...' : 'Execute GraphQL' }}
            </button>
          </div>
        </div>

        <div class="glass-card">
          <h2 class="card-title">📦 Response Data</h2>
          <div v-if="showSchema">
            <h4 style="font-size: 0.85rem; color: #a78bfa; margin-bottom: 0.5rem;">Schema SDL (/graphql/schema):</h4>
            <pre style="background: #07090e; padding: 1rem; border-radius: 0.5rem; height: 350px; overflow-y: auto; color: #c084fc; font-size: 0.8rem;">{{ schemaSdl || 'Loading schema...' }}</pre>
          </div>
          <div v-else>
            <pre style="background: #07090e; padding: 1rem; border-radius: 0.5rem; height: 350px; overflow-y: auto; color: #34d399; font-size: 0.8rem;">{{ graphqlResult ? JSON.stringify(graphqlResult, null, 2) : '// GraphQL JSON Response will appear here...' }}</pre>
          </div>
        </div>
      </section>

      <!-- TAB 6: Event Stream -->
      <section v-if="activeTab === 'events'" class="glass-card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <h2 class="card-title" style="margin-bottom: 0;">📡 Real-Time WebSocket Event Stream</h2>
          <button class="btn-secondary" style="font-size: 0.8rem; padding: 0.3rem 0.75rem;" @click="events = []">Clear</button>
        </div>
        <div class="event-log-container" style="height: 420px;">
          <div v-if="events.length === 0" style="color: var(--text-muted); text-align: center; padding: 2rem;">
            Listening for Host lifecycle, tool executions, and mesh events...
          </div>
          <div v-for="(evt, idx) in events" :key="idx" class="event-item">
            <span class="event-time">{{ new Date(evt.timestamp || Date.now()).toLocaleTimeString() }}</span>
            <span class="event-type">{{ evt.type }}</span>
            <span style="color: #cbd5e1; font-family: monospace; font-size: 0.8rem;">
              {{ JSON.stringify(evt.payload || {}) }}
            </span>
          </div>
        </div>
      </section>
    </main>

    <!-- Curator Dev Console Teleport Component -->
    <CuratorConsole
      v-model="consoleOpen"
      :adapter="blueprintCuratorAdapter"
      title="Curator Blueprint Console"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { CuratorConsole } from '@curator/console';
import { blueprintCuratorAdapter } from './curator-adapter';

// State
const consoleOpen = ref(false);
const activeTab = ref('agents');
const agents = ref<any[]>([]);
const tools = ref<any[]>([]);
const triggeringAgent = ref<string | null>(null);

// Interactive Chat
const chatMessages = ref<Array<{ sender: string; text: string }>>([
  { sender: 'system', text: 'Curator Blueprint Interactive Playground Ready.' }
]);
const chatInput = ref('');

// Tool Runner
const selectedTool = ref<any | null>(null);
const toolArgsJson = ref('{\n  "baseValue": 42,\n  "multiplier": 3\n}');
const toolResult = ref<any | null>(null);
const executingTool = ref(false);

// CoffeeScript AST
const coffeeCode = ref(`# Natural CoffeeScript Verbs AST Workflow
while_loop "$context.turn <= 5",
  seq [
    wait_event "game:ping"
    set_state turn: "$context.turn + 1", score: "$context.turn * 10"
    emit_event "game:pong", turn: "$context.turn", sender: "alpha"
  ]`);
const compiledAst = ref<any | null>(null);

// P2P Federation
const p2pLogs = ref<Array<{ time: string; text: string; color?: string }>>([
  { time: new Date().toLocaleTimeString(), text: 'P2P Federation bridge initialized.', color: '#10b981' }
]);

// Real-time Events
const events = ref<any[]>([]);

// Fetch Initial Data
async function loadData() {
  try {
    const statusRes = await fetch('/api/status');
    const status = await statusRes.json();
    if (status.recentLogs) {
      events.value = status.recentLogs.map((l: any) => ({
        type: l.type || 'log',
        payload: l,
        timestamp: l.timestamp,
      }));
    }

    const toolsRes = await fetch('/api/tools');
    const toolsJson = await toolsRes.json();
    tools.value = toolsJson.tools || [];
    if (tools.value.length > 0) {
      selectedTool.value = tools.value[0];
    }

    const agentsRes = await fetch('/api/agents');
    const agentsJson = await agentsRes.json();
    agents.value = agentsJson.agents || [];
  } catch (err) {
    console.warn('[Blueprint Web] Could not load initial state:', err);
  }
}

// Key listener for Ctrl + `
function handleKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === '`') {
    e.preventDefault();
    consoleOpen.value = !consoleOpen.value;
  }
}

// Event Bus Listener
let unsubscribeProgress: (() => void) | null = null;
onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
  loadData();

  unsubscribeProgress = blueprintCuratorAdapter.onProgress((type, payload) => {
    events.value.unshift({ type, payload, timestamp: Date.now() });
    if (events.value.length > 100) events.value.pop();

    if (type.includes('game:') || type.includes('mesh:')) {
      p2pLogs.value.unshift({
        time: new Date().toLocaleTimeString(),
        text: `[${type}] ${JSON.stringify(payload)}`,
        color: type.includes('ping') ? '#38bdf8' : '#34d399',
      });
    }
  });
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
  if (unsubscribeProgress) unsubscribeProgress();
});

// Trigger Agent
async function handleTriggerAgent(agentName: string) {
  triggeringAgent.value = agentName;
  try {
    const res = await blueprintCuratorAdapter.triggerAgent(agentName, { input: 'Hello from Blueprint Web!' });
    chatMessages.value.push({ sender: 'system', text: `Triggered agent ${agentName} (RequestId: ${res.requestId})` });
  } catch (err: any) {
    alert(`Failed to trigger agent: ${err.message}`);
  } finally {
    triggeringAgent.value = null;
  }
}

// Chat Send
async function sendChatMessage() {
  if (!chatInput.value.trim()) return;
  const userText = chatInput.value;
  chatMessages.value.push({ sender: 'user', text: userText });
  chatInput.value = '';

  try {
    const res = await blueprintCuratorAdapter.triggerAgent('dialog_playground', { userInput: userText });
    chatMessages.value.push({ sender: 'agent', text: `Agent acknowledged: "${userText}" (Task #${res.requestId})` });
  } catch (err: any) {
    chatMessages.value.push({ sender: 'system', text: `Error: ${err.message}` });
  }
}

// Tool Selection & Execution
function selectToolForExecution(tool: any) {
  selectedTool.value = tool;
  if (tool.name === 'calculate_metric') {
    toolArgsJson.value = JSON.stringify({ baseValue: 50, multiplier: 4 }, null, 2);
  } else {
    toolArgsJson.value = JSON.stringify({ message: 'Hello from UI' }, null, 2);
  }
}

async function handleExecuteTool() {
  if (!selectedTool.value) return;
  executingTool.value = true;
  toolResult.value = null;
  try {
    const parsedArgs = JSON.parse(toolArgsJson.value);
    const res = await fetch(`/api/curator/tools/${selectedTool.value.name}/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args: parsedArgs }),
    });
    toolResult.value = await res.json();
  } catch (err: any) {
    toolResult.value = { error: err.message };
  } finally {
    executingTool.value = false;
  }
}

// GraphQL Explorer
const selectedPreset = ref('metrics');
const graphqlQuery = ref(`query GetOverview {
  metrics {
    totalRequests
    completedRequests
    failedRequests
    totalAgents
    activeAgents
    totalTools
    databaseEngine
  }
  curatorDatabaseHealth {
    requestsTotal
    requestsCompleted
    requestsPending
    storageEngine
  }
}`);
const graphqlResult = ref<any | null>(null);
const executingGql = ref(false);
const showSchema = ref(false);
const schemaSdl = ref<string>('');

const presetQueries: Record<string, string> = {
  metrics: `query GetOverview {
  metrics {
    totalRequests
    completedRequests
    failedRequests
    totalAgents
    activeAgents
    totalTools
    databaseEngine
  }
  curatorDatabaseHealth {
    requestsTotal
    requestsCompleted
    requestsPending
    storageEngine
  }
}`,
  tools_agents: `query ListToolsAndAgents {
  tools {
    name
    description
    accessLevel
  }
  agents {
    name
    description
    schedule
    enabled
  }
}`,
  requests: `query GetCuratorRequests {
  curatorRequests(limit: 5) {
    id
    agentName
    status
    retryCount
    ast
    responses {
      id
      content
      createdAt
    }
  }
}`,
  conversations: `query GetConversations {
  conversations(limit: 5) {
    id
    externalId
    createdAt
    responses {
      id
      content
      createdAt
    }
  }
}`,
  exec_tool: `mutation RunTool {
  executeTool(name: "calculate_metric", args: "{\\"baseValue\\": 40, \\"multiplier\\": 3}") {
    success
    tool
    result
    error
  }
}`,
  trigger_agent: `mutation TriggerAgent {
  triggerAgent(name: "dialog_playground", context: "{\\"userInput\\": \\"Hello from GraphQL\\"}") {
    success
    requestId
    status
    error
  }
}`
};

function applyPreset() {
  if (presetQueries[selectedPreset.value]) {
    graphqlQuery.value = presetQueries[selectedPreset.value];
  }
}

async function handleExecuteGraphql() {
  executingGql.value = true;
  graphqlResult.value = null;
  try {
    const res = await fetch('/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: graphqlQuery.value }),
    });
    graphqlResult.value = await res.json();
  } catch (err: any) {
    graphqlResult.value = { errors: [{ message: err.message }] };
  } finally {
    executingGql.value = false;
  }
}

async function fetchSchemaSdl() {
  try {
    const res = await fetch('/graphql/schema');
    schemaSdl.value = await res.text();
  } catch (err: any) {
    schemaSdl.value = `// Could not load schema: ${err.message}`;
  }
}

// Compile CoffeeScript
async function handleCompileCoffee() {
  try {
    const res = await fetch('/api/curator/ast/compile-coffee', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: coffeeCode.value }),
    });
    const json = await res.json();
    compiledAst.value = json.ast;
  } catch (err: any) {
    compiledAst.value = { error: err.message };
  }
}

// Trigger P2P Ping-Pong
async function handleTriggerP2P() {
  p2pLogs.value.unshift({
    time: new Date().toLocaleTimeString(),
    text: 'Serving BANG! event over P2P mesh...',
    color: '#f59e0b',
  });
  try {
    await fetch('/api/curator/p2p/bang', { method: 'POST' });
  } catch (err: any) {
    p2pLogs.value.unshift({
      time: new Date().toLocaleTimeString(),
      text: `Failed to trigger BANG: ${err.message}`,
      color: '#ef4444',
    });
  }
}
</script>

