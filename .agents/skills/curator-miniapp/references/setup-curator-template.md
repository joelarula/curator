# Curator Setup & Tool Registration Template

This reference demonstrates how to provision the Curator workflow database (`curator.db`), register custom MiniApp tools and plugins into `curatorEngine`, compile Formal Execution AST scripts, and register Bree-scheduled agents.

---

## 1. Plugin & Tool Registration (`src/plugins/index.js`)

```javascript
export const domainPlugin = {
  name: 'miniapp-domain-plugin',
  tools: {
    'miniapp_sync_data': {
      description: 'Syncs data from remote sources into domain database',
      inputSchema: { type: 'object', properties: { force: { type: 'boolean' } } },
      async handler(args, context) {
        console.log('[Tool] Running miniapp_sync_data with args:', args);
        return { success: true, timestamp: new Date().toISOString() };
      }
    }
  },
  agents: {
    'miniapp_sync_agent': {
      description: 'Scheduled data sync agent',
      schedule: '0 * * * *', // hourly cron
      enabled: true,
      ast: {
        type: 'Curator_Tool',
        toolName: 'miniapp_sync_data',
        args: { force: false }
      }
    }
  }
};

export async function registerMiniAppPlugins({ db }) {
  let engine;
  try {
    const { curatorEngine } = await import('@curator/agent-server');
    engine = curatorEngine;
  } catch {
    console.warn('[MiniApp] Agent Server unavailable; running fallback local engine');
    engine = {
      tools: new Map(),
      agents: new Map(),
      registerPlugin(p) {
        if (p.tools) Object.entries(p.tools).forEach(([k, v]) => this.tools.set(k, v));
        if (p.agents) Object.entries(p.agents).forEach(([k, v]) => this.agents.set(k, v));
      }
    };
  }

  engine.registerPlugin(domainPlugin);
  return engine;
}
```

---

## 2. Curator DB Provisioning (`src/setup-curator.js`)

```javascript
import { provisionSqliteDb } from '@curator/agent-server';
import { openDatabase } from './db.js';
import { registerMiniAppPlugins } from './plugins/index.js';

const databasePath = process.env.CURATOR_DATABASE_PATH ?? 'data/curator.db';
const databaseName = process.env.CURATOR_DATABASE_NAME ?? 'miniapp';

// 1. Provision Curator Agent Server Database
const prisma = await provisionSqliteDb(databaseName, false, { databasePath });

// 2. Open Domain DB & Register Tools/Plugins
const domainDb = openDatabase();
const engine = await registerMiniAppPlugins({ db: domainDb });

// 3. Ensure System User & Project
const user = await prisma.user.upsert({
  where: { email: 'system@local' },
  update: {},
  create: { id: '1', name: 'System User', email: 'system@local' }
});

const project = await prisma.project.upsert({
  where: { id: '1' },
  update: {},
  create: { id: '1', name: 'MiniApp Project', userId: user.id }
});

// 4. Register Tools in Curator DB
for (const [name, tool] of engine.tools) {
  await prisma.tool.upsert({
    where: { name },
    update: { description: tool.description ?? '', version: '1.0.0' },
    create: { name, description: tool.description ?? '', version: '1.0.0' }
  });
}

// 5. Register Scripts & Scheduled Agents
for (const [name, definition] of engine.agents) {
  const ast = definition.ast ?? {
    type: 'Curator_Tool',
    toolName: definition.toolName ?? name,
    args: definition.args || {}
  };

  const script = await prisma.script.upsert({
    where: { name },
    update: { body: `// MiniApp workflow: ${name}`, ast, userId: user.id, projectId: project.id },
    create: { name, body: `// MiniApp workflow: ${name}`, ast, userId: user.id, projectId: project.id }
  });

  await prisma.agent.upsert({
    where: { name },
    update: {
      scriptId: script.id,
      userId: user.id,
      projectId: project.id,
      enabled: definition.enabled === true,
      schedule: definition.schedule ?? '0 * * * *'
    },
    create: {
      name,
      scriptId: script.id,
      userId: user.id,
      projectId: project.id,
      enabled: definition.enabled === true,
      schedule: definition.schedule ?? '0 * * * *'
    }
  });
}

console.log('[Setup] Curator database provisioning complete.');
await prisma.$disconnect();
domainDb.close();
```
