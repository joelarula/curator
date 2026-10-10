<template>
  <div class="tree-node-wrapper" :class="{ 'is-root': depth === 0, 'has-children': node.children.length > 0 }">
    <div 
      class="tree-node-card" 
      :class="[
        'status-card-' + (node.status || 'pending').toLowerCase(),
        { 'is-selected': isSelected, 'has-subtasks': node.children.length > 0 }
      ]"
      @click="$emit('select-node', node)"
    >
      <!-- Header Row -->
      <div class="node-header">
        <div class="node-left">
          <!-- Toggle Subtasks Button -->
          <button 
            v-if="node.children.length > 0" 
            class="tree-toggle-btn"
            :title="isCollapsed ? 'Expand sub-tasks' : 'Collapse sub-tasks'"
            @click.stop="toggleCollapse"
          >
            <span class="chevron" :class="{ collapsed: isCollapsed }">▼</span>
            <span class="child-count-pill">{{ node.children.length }}</span>
          </button>
          <span v-else class="tree-leaf-indicator">•</span>

          <!-- ID Badge -->
          <span class="node-id" title="Request ID">#{{ node.id }}</span>

          <!-- Node Type / Tool Badge -->
          <span class="node-type-badge" :class="'type-' + nodeTypeClass">
            <span class="type-icon">{{ nodeTypeIcon }}</span>
            <span class="type-text">{{ node.toolName || node.nodeType || 'AST Task' }}</span>
          </span>

          <!-- Turn Badge if present in context -->
          <span v-if="contextTurn != null" class="node-turn-badge" title="Conversation Turn">
            Turn #{{ contextTurn }}
          </span>

          <!-- Parent Task Link -->
          <span 
            v-if="node.parentId && depth > 0" 
            class="node-parent-badge" 
            :title="'Spawned by parent task #' + node.parentId"
            @click.stop="$emit('select-node', { id: node.parentId } as any)"
          >
            ↖ #{{ node.parentId }}
          </span>

          <!-- Agent Name Badge (if root or explicit) -->
          <span v-if="node.agentName && (depth === 0 || node.agentName !== 'unknown')" class="node-agent-badge">
            🤖 {{ node.agentName }}
          </span>
        </div>

        <div class="node-right">
          <!-- Dates / Duration -->
          <span class="node-time" :title="timeTooltip">
            {{ formatTime(node.createdAt) }}
            <span v-if="node.durationMs != null" class="node-duration">({{ formatDuration(node.durationMs) }})</span>
          </span>

          <!-- Status Badge -->
          <span class="node-status" :class="'status-' + (node.status || 'pending').toLowerCase()">
            {{ node.status || 'pending' }}
          </span>
        </div>
      </div>

      <!-- Quick Summary Row (if present) -->
      <div v-if="node.summary" class="node-summary-row">
        <span class="summary-label">Target:</span>
        <span class="summary-text">{{ node.summary }}</span>
      </div>

      <!-- Detail Inspector Action Bar -->
      <div class="node-actions-bar" @click.stop>
        <button 
          class="inspect-tab-btn" 
          :class="{ active: openSection === 'context', 'has-data': node.contextJson }"
          @click="toggleSection('context')"
        >
          <span class="tab-icon">🔍</span> Context
          <span v-if="node.contextJson" class="data-indicator"></span>
        </button>

        <button 
          class="inspect-tab-btn" 
          :class="{ active: openSection === 'ast' }"
          @click="toggleSection('ast')"
        >
          <span class="tab-icon">🧩</span> AST
        </button>

        <button 
          class="inspect-tab-btn" 
          :class="{ active: openSection === 'responses', 'has-data': (node.raw.responses && node.raw.responses.length > 0) }"
          @click="toggleSection('responses')"
        >
          <span class="tab-icon">💬</span> Responses
          <span v-if="node.raw.responses && node.raw.responses.length" class="count-pill">
            {{ node.raw.responses.length }}
          </span>
        </button>

        <button 
          class="inspect-tab-btn" 
          :class="{ active: openSection === 'timeline' }"
          @click="toggleSection('timeline')"
        >
          <span class="tab-icon">⏱️</span> Timeline
        </button>

        <div class="actions-spacer"></div>

        <button 
          v-if="openSection" 
          class="inspect-tab-btn close-btn" 
          title="Close details"
          @click="openSection = null"
        >
          ✕ Close
        </button>
      </div>

      <!-- Expanded Section: CONTEXT -->
      <div v-if="openSection === 'context'" class="node-drawer context-drawer" @click.stop>
        <div class="drawer-header">
          <div class="d-flex align-center gap-2">
            <span class="drawer-title">Execution Context (Variables &amp; State):</span>
            <input 
              v-if="parsedContextEntries.length > 3" 
              v-model="contextFilter" 
              type="text" 
              placeholder="Filter keys..." 
              class="drawer-filter-input"
            />
          </div>
          <button class="copy-btn" @click="copyText(node.contextJson || '{}')">📋 Copy JSON</button>
        </div>

        <!-- Key-Value Summary Grid -->
        <div v-if="filteredContextEntries.length > 0" class="context-key-badges">
          <div v-for="[k, v] in filteredContextEntries" :key="k" class="context-pill">
            <span class="c-key">{{ k }}:</span>
            <span class="c-val" :title="String(v)">{{ formatValuePreview(v) }}</span>
          </div>
        </div>

        <pre v-if="node.contextJson" class="drawer-code">{{ node.contextJson }}</pre>
        <div v-else class="drawer-empty">No context payload attached to this task.</div>
      </div>

      <!-- Expanded Section: AST -->
      <div v-if="openSection === 'ast'" class="node-drawer ast-drawer" @click.stop>
        <div class="drawer-header">
          <span class="drawer-title">Execution AST Definition:</span>
          <button class="copy-btn" @click="copyText(node.astJson)">📋 Copy AST</button>
        </div>
        <pre class="drawer-code">{{ node.astJson }}</pre>
      </div>

      <!-- Expanded Section: RESPONSES / CONVERSATION FEED -->
      <div v-if="openSection === 'responses'" class="node-drawer responses-drawer" @click.stop>
        <div class="drawer-header">
          <span class="drawer-title">Execution Outputs &amp; Conversation Stream:</span>
          <button v-if="node.raw.responses?.length" class="copy-btn" @click="copyAllResponses">📋 Copy All</button>
        </div>
        <div v-if="node.raw.responses && node.raw.responses.length" class="responses-feed">
          <div v-for="resp in parsedResponses" :key="resp.id" class="response-entry" :class="'resp-role-' + resp.role">
            <div class="resp-header">
              <div class="d-flex align-center gap-2">
                <span class="resp-role-badge">{{ resp.roleIcon }} {{ resp.role.toUpperCase() }}</span>
                <span class="resp-id">#{{ resp.id }}</span>
              </div>
              <div class="d-flex align-center gap-2">
                <span class="resp-time">{{ resp.time }}</span>
                <button class="copy-btn mini-btn" @click="copyText(resp.rawContent)">📋</button>
              </div>
            </div>
            <!-- If message text exists, display chat-style preview -->
            <div v-if="resp.messageText" class="resp-message-text">{{ resp.messageText }}</div>
            <pre class="resp-content">{{ resp.formattedContent }}</pre>
          </div>
        </div>
        <div v-else class="drawer-empty">No response logs recorded for this request yet.</div>
      </div>

      <!-- Expanded Section: TIMELINE & METADATA -->
      <div v-if="openSection === 'timeline'" class="node-drawer timeline-drawer" @click.stop>
        <div class="drawer-header">
          <span class="drawer-title">Task Timeline &amp; Execution Details:</span>
        </div>
        <div class="timeline-grid">
          <div class="timeline-item">
            <span class="tl-lbl">Created:</span>
            <span class="tl-val">{{ formatFullDate(node.createdAt) }}</span>
          </div>
          <div class="timeline-item" v-if="node.scheduledAt">
            <span class="tl-lbl">Scheduled:</span>
            <span class="tl-val">{{ formatFullDate(node.scheduledAt) }}</span>
          </div>
          <div class="timeline-item" v-if="node.updatedAt">
            <span class="tl-lbl">Updated / Completed:</span>
            <span class="tl-val">{{ formatFullDate(node.updatedAt) }}</span>
          </div>
          <div class="timeline-item" v-if="node.durationMs != null">
            <span class="tl-lbl">Execution Duration:</span>
            <span class="tl-val highlight">{{ formatDuration(node.durationMs) }}</span>
          </div>
          <div class="timeline-item">
            <span class="tl-lbl">Parent Task ID:</span>
            <span class="tl-val">{{ node.parentId ? '#' + node.parentId : 'None (Root Task)' }}</span>
          </div>
          <div class="timeline-item" v-if="node.notifyId">
            <span class="tl-lbl">Notify / Join ID:</span>
            <span class="tl-val">#{{ node.notifyId }}</span>
          </div>
          <div class="timeline-item" v-if="node.retryCount != null">
            <span class="tl-lbl">Retry Count:</span>
            <span class="tl-val">{{ node.retryCount }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Recursive Children Subtree -->
    <div 
      v-if="node.children.length > 0 && !isCollapsed" 
      class="node-children-container"
    >
      <div class="tree-branch-line"></div>
      <div class="children-list">
        <RequestTreeNode
          v-for="child in node.children"
          :key="child.id"
          :node="child"
          :depth="depth + 1"
          :collapsed-nodes="collapsedNodes"
          :selected-node-id="selectedNodeId"
          @toggle-collapse="$emit('toggle-collapse', $event)"
          @select-node="$emit('select-node', $event)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { RequestTreeNode as IRequestTreeNode } from './types';

const props = defineProps<{
  node: IRequestTreeNode;
  depth: number;
  collapsedNodes: Set<string>;
  selectedNodeId?: string | null;
}>();

const emit = defineEmits<{
  (e: 'toggle-collapse', id: string): void;
  (e: 'select-node', node: IRequestTreeNode): void;
}>();

const openSection = ref<'context' | 'ast' | 'responses' | 'timeline' | null>(null);
const contextFilter = ref('');

const isCollapsed = computed(() => props.collapsedNodes.has(props.node.id));
const isSelected = computed(() => props.selectedNodeId === props.node.id);

const parsedContext = computed<Record<string, any>>(() => {
  if (!props.node.contextJson) return {};
  try {
    return JSON.parse(props.node.contextJson);
  } catch {
    return {};
  }
});

const contextTurn = computed<number | string | null>(() => {
  const ctx = parsedContext.value;
  if (ctx.turn != null) return ctx.turn;
  if (ctx.$turn != null) return ctx.$turn;
  if (ctx.step != null) return ctx.step;
  return null;
});

const parsedContextEntries = computed<[string, any][]>(() => {
  return Object.entries(parsedContext.value);
});

const filteredContextEntries = computed<[string, any][]>(() => {
  if (!contextFilter.value.trim()) return parsedContextEntries.value;
  const q = contextFilter.value.toLowerCase();
  return parsedContextEntries.value.filter(([k]) => k.toLowerCase().includes(q));
});

const parsedResponses = computed(() => {
  if (!props.node.raw?.responses) return [];
  return props.node.raw.responses.map((resp: any) => {
    let role = 'assistant';
    let roleIcon = '🤖';
    let messageText = '';
    let formatted = resp.content;

    try {
      const obj = JSON.parse(resp.content);
      formatted = JSON.stringify(obj, null, 2);
      if (obj.role) {
        role = obj.role;
      }
      if (obj.text || obj.message || obj.content) {
        messageText = typeof (obj.text || obj.message || obj.content) === 'string'
          ? (obj.text || obj.message || obj.content)
          : '';
      }
      if (role === 'user') roleIcon = '👤';
      else if (role === 'system') roleIcon = '⚙️';
      else if (role === 'tool') roleIcon = '🔧';
    } catch (_) {
      formatted = resp.content;
    }

    return {
      id: resp.id,
      role,
      roleIcon,
      messageText,
      formattedContent: formatted,
      rawContent: resp.content,
      time: resp.createdAt ? new Date(resp.createdAt).toLocaleTimeString() : '',
    };
  });
});

const nodeTypeClass = computed(() => {
  const t = (props.node.nodeType || '').toLowerCase();
  if (t.includes('tool')) return 'tool';
  if (t.includes('foreach')) return 'foreach';
  if (t.includes('sequential') || t.includes('sequence')) return 'sequence';
  if (t.includes('parallel')) return 'parallel';
  if (t.includes('script')) return 'script';
  return 'default';
});

const nodeTypeIcon = computed(() => {
  const t = (props.node.nodeType || '').toLowerCase();
  if (t.includes('tool')) return '🔧';
  if (t.includes('foreach')) return '🔁';
  if (t.includes('sequential') || t.includes('sequence')) return '⛓️';
  if (t.includes('parallel')) return '⚡';
  if (t.includes('script')) return '📜';
  if (t.includes('while')) return '🔄';
  return '🧩';
});

const timeTooltip = computed(() => {
  const lines = [`Created: ${formatFullDate(props.node.createdAt)}`];
  if (props.node.updatedAt) lines.push(`Updated: ${formatFullDate(props.node.updatedAt)}`);
  if (props.node.scheduledAt) lines.push(`Scheduled: ${formatFullDate(props.node.scheduledAt)}`);
  return lines.join('\n');
});

function toggleCollapse() {
  emit('toggle-collapse', props.node.id);
}

function toggleSection(section: 'context' | 'ast' | 'responses' | 'timeline') {
  openSection.value = openSection.value === section ? null : section;
}

function formatValuePreview(v: any): string {
  if (v == null) return 'null';
  if (typeof v === 'object') return Array.isArray(v) ? `Array(${v.length})` : '{...}';
  return String(v);
}

function formatTime(isoStr?: string | null): string {
  if (!isoStr) return '—';
  try {
    return new Date(isoStr).toLocaleTimeString();
  } catch {
    return isoStr;
  }
}

function formatFullDate(isoStr?: string | null): string {
  if (!isoStr) return '—';
  try {
    return new Date(isoStr).toLocaleString();
  } catch {
    return isoStr;
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function copyText(text: string) {
  if (!text) return;
  navigator.clipboard.writeText(text);
}

function copyAllResponses() {
  if (!props.node.raw?.responses) return;
  const combined = props.node.raw.responses.map((r: any) => `=== Response #${r.id} (${r.createdAt || ''}) ===\n${r.content}`).join('\n\n');
  copyText(combined);
}
</script>

<style scoped>
.tree-node-wrapper {
  display: flex;
  flex-direction: column;
  position: relative;
}

.tree-node-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: all 0.15s ease;
  position: relative;
}

.tree-node-card:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.16);
}

.is-root > .tree-node-card {
  border-left: 3px solid #38bdf8;
  background: rgba(15, 23, 42, 0.6);
}

.status-card-completed { border-left-color: #10b981 !important; }
.status-card-failed { border-left-color: #ef4444 !important; }
.status-card-running { border-left-color: #38bdf8 !important; }
.status-card-pending, .status-card-new, .status-card-waiting { border-left-color: #f59e0b !important; }

/* Header */
.node-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.node-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.node-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tree-toggle-btn {
  background: rgba(56, 189, 248, 0.12);
  border: 1px solid rgba(56, 189, 248, 0.3);
  color: #38bdf8;
  border-radius: 4px;
  padding: 1px 6px;
  font-size: 0.68rem;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s;
}

.tree-toggle-btn:hover {
  background: rgba(56, 189, 248, 0.25);
  border-color: #38bdf8;
}

.chevron {
  font-size: 0.65rem;
  transition: transform 0.18s ease;
  display: inline-block;
}

.chevron.collapsed {
  transform: rotate(-90deg);
}

.child-count-pill {
  font-size: 0.62rem;
  background: rgba(0, 0, 0, 0.3);
  padding: 0 4px;
  border-radius: 999px;
}

.tree-leaf-indicator {
  color: #64748b;
  font-size: 0.8rem;
  line-height: 1;
  padding: 0 4px;
}

.node-id {
  font-size: 0.72rem;
  color: #7dd3fc;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.node-type-badge {
  font-size: 0.68rem;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #e2e8f0;
}

.type-tool { background: rgba(56, 189, 248, 0.12); border-color: rgba(56, 189, 248, 0.3); color: #bae6fd; }
.type-foreach { background: rgba(168, 85, 247, 0.12); border-color: rgba(168, 85, 247, 0.3); color: #e9d5ff; }
.type-sequence { background: rgba(245, 158, 11, 0.12); border-color: rgba(245, 158, 11, 0.3); color: #fde68a; }
.type-parallel { background: rgba(236, 72, 153, 0.12); border-color: rgba(236, 72, 153, 0.3); color: #fbcfe8; }
.type-script { background: rgba(16, 185, 129, 0.12); border-color: rgba(16, 185, 129, 0.3); color: #a7f3d0; }

.node-agent-badge {
  font-size: 0.65rem;
  color: #c4b5fd;
  background: rgba(139, 92, 246, 0.12);
  border: 1px solid rgba(139, 92, 246, 0.25);
  padding: 1px 6px;
  border-radius: 4px;
}

.node-time {
  font-size: 0.68rem;
  color: #94a3b8;
}

.node-duration {
  color: #38bdf8;
  font-weight: 600;
  margin-left: 3px;
}

.node-status {
  font-size: 0.62rem;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.status-completed { background: rgba(16, 185, 129, 0.18); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
.status-pending, .status-new, .status-waiting { background: rgba(245, 158, 11, 0.18); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
.status-running { background: rgba(56, 189, 248, 0.2); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4); animation: pulse 1.8s infinite; }
.status-failed { background: rgba(239, 68, 68, 0.18); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }

/* Quick Summary */
.node-summary-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.68rem;
  background: rgba(0, 0, 0, 0.25);
  padding: 3px 8px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.04);
}

.summary-label {
  color: #64748b;
  font-weight: 600;
  flex-shrink: 0;
}

.summary-text {
  color: #cbd5e1;
  font-family: ui-monospace, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Actions Toolbar */
.node-actions-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
  padding-top: 4px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.inspect-tab-btn {
  background: transparent;
  border: 1px solid transparent;
  color: #94a3b8;
  font-size: 0.66rem;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s;
}

.inspect-tab-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #f1f5f9;
}

.inspect-tab-btn.active {
  background: rgba(56, 189, 248, 0.15);
  border-color: rgba(56, 189, 248, 0.35);
  color: #38bdf8;
}

.inspect-tab-btn.has-data {
  color: #e2e8f0;
}

.data-indicator {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #38bdf8;
}

.count-pill {
  font-size: 0.58rem;
  background: rgba(16, 185, 129, 0.25);
  color: #34d399;
  padding: 0 4px;
  border-radius: 999px;
  font-weight: 700;
}

.close-btn {
  color: #f87171 !important;
  font-size: 0.62rem;
}

.actions-spacer {
  flex: 1;
}

/* Drawers */
.node-drawer {
  background: #020617;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 5px;
  padding: 8px;
  margin-top: 4px;
  animation: drawer-slide 0.15s ease-out;
}

@keyframes drawer-slide {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.drawer-title {
  font-size: 0.68rem;
  font-weight: 600;
  color: #94a3b8;
}

.copy-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #cbd5e1;
  font-size: 0.6rem;
  padding: 1px 5px;
  border-radius: 3px;
  cursor: pointer;
}
.copy-btn:hover { background: rgba(255, 255, 255, 0.12); color: #fff; }

.drawer-code {
  background: rgba(0, 0, 0, 0.4);
  padding: 6px;
  border-radius: 4px;
  font-size: 0.66rem;
  color: #cbd5e1;
  max-height: 180px;
  overflow-y: auto;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
}

.drawer-empty {
  font-size: 0.66rem;
  color: #64748b;
  font-style: italic;
  padding: 4px 0;
}

/* Responses Feed */
.responses-feed {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.response-entry {
  background: rgba(16, 185, 129, 0.04);
  border: 1px solid rgba(16, 185, 129, 0.18);
  border-radius: 4px;
  padding: 6px;
}

.resp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.resp-id {
  font-size: 0.64rem;
  color: #34d399;
  font-weight: 700;
}

.resp-time {
  font-size: 0.62rem;
  color: #64748b;
}

.resp-content {
  background: rgba(0, 0, 0, 0.3);
  padding: 4px 6px;
  border-radius: 3px;
  font-size: 0.65rem;
  color: #6ee7b7;
  max-height: 150px;
  overflow-y: auto;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
}

/* Timeline Grid */
.timeline-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 6px 12px;
  background: rgba(0, 0, 0, 0.3);
  padding: 8px;
  border-radius: 4px;
}

.timeline-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tl-lbl {
  font-size: 0.6rem;
  color: #64748b;
  font-weight: 600;
}

.tl-val {
  font-size: 0.68rem;
  color: #e2e8f0;
}

.tl-val.highlight {
  color: #38bdf8;
  font-weight: 700;
}

/* Turn & Parent Link Badges */
.node-turn-badge {
  font-size: 0.62rem;
  font-weight: 700;
  background: rgba(168, 85, 247, 0.2);
  color: #c084fc;
  border: 1px solid rgba(168, 85, 247, 0.4);
  padding: 1px 6px;
  border-radius: 4px;
}

.node-parent-badge {
  font-size: 0.6rem;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.06);
  color: #94a3b8;
  border: 1px dashed rgba(255, 255, 255, 0.2);
  padding: 1px 5px;
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.15s;
}
.node-parent-badge:hover {
  background: rgba(56, 189, 248, 0.2);
  color: #38bdf8;
  border-color: #38bdf8;
}

.drawer-filter-input {
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #f1f5f9;
  font-size: 0.62rem;
  padding: 1px 6px;
  border-radius: 3px;
  outline: none;
}
.drawer-filter-input:focus {
  border-color: #38bdf8;
}

/* Context Key Badges */
.context-key-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 6px;
  max-height: 90px;
  overflow-y: auto;
}

.context-pill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 0.62rem;
}

.c-key {
  color: #38bdf8;
  font-weight: 600;
  font-family: ui-monospace, monospace;
}

.c-val {
  color: #e2e8f0;
  font-family: ui-monospace, monospace;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mini-btn {
  padding: 0 4px !important;
  font-size: 0.55rem !important;
}

/* Response Role Styles */
.resp-role-user {
  background: rgba(56, 189, 248, 0.05) !important;
  border-color: rgba(56, 189, 248, 0.25) !important;
}
.resp-role-assistant {
  background: rgba(16, 185, 129, 0.05) !important;
  border-color: rgba(16, 185, 129, 0.25) !important;
}
.resp-role-system, .resp-role-tool {
  background: rgba(245, 158, 11, 0.05) !important;
  border-color: rgba(245, 158, 11, 0.25) !important;
}

.resp-role-badge {
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.4);
}

.resp-message-text {
  font-size: 0.68rem;
  color: #f8fafc;
  background: rgba(0, 0, 0, 0.35);
  padding: 5px 8px;
  border-radius: 4px;
  margin-bottom: 4px;
  line-height: 1.4;
  white-space: pre-wrap;
}

/* Nested Subtree Styles */
.node-children-container {
  position: relative;
  margin-left: 18px;
  padding-left: 14px;
  border-left: 2px solid rgba(56, 189, 248, 0.2);
  margin-top: 6px;
  margin-bottom: 2px;
}

.children-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
</style>
