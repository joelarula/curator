import { existsSync } from 'node:fs';
import { provisionSqliteDb } from '@curator/agent-server';
import { registerKeerisPlugins } from './plugins/index.js';
import { openDatabase } from './db.js';

const databasePath = process.env.CURATOR_DATABASE_PATH ?? 'data/curator.db';
const databaseName = process.env.CURATOR_DATABASE_NAME ?? 'keeris';

if (!existsSync(databasePath)) {
  throw new Error(`Curator database not found: ${databasePath}. Run Prisma db push first.`);
}
const prisma = await provisionSqliteDb(databaseName, false, { databasePath });
const sqlite = openDatabase(process.env.DATABASE_PATH ?? 'data/kauamangiv.sqlite');
const engine = await registerKeerisPlugins({ db: sqlite });
const user = await prisma.user.upsert({ where: { id: 1 }, update: {}, create: { id: 1, username: 'system', name: 'System User', email: 'system@local' } });
const project = await prisma.project.upsert({ where: { id: 1 }, update: {}, create: { id: 1, name: 'Keeris', userId: user.id } });

for (const [name, tool] of engine.tools) {
  await prisma.tool.upsert({
    where: { name },
    update: { description: tool.description, parametersSchema: tool.parameters, sourceCode: '' },
    create: { name, description: tool.description, parametersSchema: tool.parameters, sourceCode: '' },
  });
}
for (const [name, definition] of engine.agents) {
  const agent = await prisma.agent.upsert({
    where: { name },
    update: { description: definition.description ?? '', userId: user.id, projectId: project.id },
    create: { name, description: definition.description ?? '', userId: user.id, projectId: project.id },
  });
  await prisma.agentWorkflow.upsert({
    where: { name },
    update: { description: `Keeris workflow: ${name}`, ast: definition, agentId: agent.id },
    create: { name, description: `Keeris workflow: ${name}`, ast: definition, agentId: agent.id },
  });
}

console.log(JSON.stringify({ phase: 'setup-complete', databasePath, plugins: engine.plugins.map((plugin) => plugin.name), tools: [...engine.tools.keys()], workflows: [...engine.agents.keys()] }, null, 2));
await prisma.$disconnect();
sqlite.close();