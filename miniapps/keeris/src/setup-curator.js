import { existsSync } from 'node:fs';
import { provisionSqliteDb } from '@curator/agent-server';
import { registerKeerisPlugins } from './plugins/index.js';
import { openDatabase } from './db.js';

const databasePath = process.env.CURATOR_DATABASE_PATH ?? 'data/curator.db';
const databaseName = process.env.CURATOR_DATABASE_NAME ?? 'keeris';

const prisma = await provisionSqliteDb(databaseName, false, { databasePath });
const sqlite = openDatabase(process.env.DATABASE_PATH ?? 'data/keeris.db');
const engine = await registerKeerisPlugins({ db: sqlite });
const user = await prisma.user.upsert({ where: { email: 'system@local' }, update: {}, create: { id: '1', name: 'System User', email: 'system@local' } });
const project = await prisma.project.upsert({ where: { id: '1' }, update: {}, create: { id: '1', name: 'Keeris', userId: user.id } });

for (const [name, tool] of engine.tools) {
  await prisma.tool.upsert({
    where: { name },
    update: { description: tool.description ?? '', version: '1.0.0' },
    create: { name, description: tool.description ?? '', version: '1.0.0' },
  });
}
for (const [name, definition] of engine.agents) {
  const isAgentEnabled = definition.enabled === true;
  const ast = definition.ast ?? {
    type: definition.type || 'Curator_Tool',
    toolName: definition.toolName,
    args: definition.args || {},
  };
  const script = await prisma.script.upsert({
    where: { name },
    update: { body: `// Keeris workflow: ${name}`, ast, userId: user.id, projectId: project.id },
    create: { name, body: `// Keeris workflow: ${name}`, ast, userId: user.id, projectId: project.id },
  });
  await prisma.agent.upsert({
    where: { name },
    update: { scriptId: script.id, userId: user.id, projectId: project.id, enabled: isAgentEnabled, schedule: definition.schedule ?? '0 * * * *' },
    create: { name, scriptId: script.id, userId: user.id, projectId: project.id, enabled: isAgentEnabled, schedule: definition.schedule ?? '0 * * * *' },
  });
}

console.log(JSON.stringify({ phase: 'setup-complete', databasePath, plugins: engine.plugins.map((plugin) => plugin.name), tools: [...engine.tools.keys()], workflows: [...engine.agents.keys()] }, null, 2));
await prisma.$disconnect();
sqlite.close();