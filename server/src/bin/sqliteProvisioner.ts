/**
 * sqliteProvisioner.ts
 *
 * Resolves a named local SQLite database for `curator run --db <name>`.
 * - Databases are stored under <project-root>/data/<name>.db
 * - If the file does not yet exist, migrations are deployed and a minimal
 *   seed (user + system project + AI models) is applied automatically.
 * - Returns a ready-to-use PrismaClient connected to that database.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');

export async function provisionSqliteDb(name: string) {
  // Validate name (alphanumeric, hyphens, underscores only)
  if (!/^[\w-]+$/.test(name)) {
    throw new Error(`[Curator] Invalid database name "${name}". Use letters, numbers, hyphens or underscores only.`);
  }

  // Ensure data/ directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`[Curator] Created data directory: ${DATA_DIR}`);
  }

  const dbPath = path.join(DATA_DIR, `${name}.db`);
  const dbUrl  = `file:${dbPath}`;
  const isNew  = !fs.existsSync(dbPath);

  if (isNew) {
    console.log(`[Curator] 🗄️  Provisioning new database: ${name}`);

    // 1. Push the schema (simpler than migrate deploy for SQLite dev databases)
    console.log(`[Curator]    Applying schema...`);
    execSync(
      `npx prisma db push --config="${path.join(PROJECT_ROOT, 'prisma.sqlite.config.js')}"`,
      {
        stdio: 'inherit',
        cwd: PROJECT_ROOT,
        env: { ...process.env, DATABASE_URL: dbUrl }
      }
    );

    // 2. Run minimal seed via the generated SQLite client
    console.log(`[Curator]    Seeding default user, system project, and AI models...`);
    await seedSqliteDb(dbUrl);

    console.log(`[Curator] ✓  Database ready: ${dbPath}`);
  } else {
    console.log(`[Curator] 🗄️  Using existing database: ${name}`);
  }

  // Return a PrismaClient pointed at the SQLite file via better-sqlite3 adapter.
  // We import the generated SQLite client (not the PG one).
  const { PrismaClient } = await import('../generated/prisma-sqlite/index.js');
  const adapter = new PrismaBetterSqlite3({ url: dbUrl });
  return new PrismaClient({ adapter }) as any;
}

// ---------------------------------------------------------------------------
// Minimal seed — just enough for the CLI to work
// ---------------------------------------------------------------------------
async function seedSqliteDb(dbUrl: string) {
  const { PrismaClient } = await import('../generated/prisma-sqlite/index.js');
  const adapter = new PrismaBetterSqlite3({ url: dbUrl });
  const prisma = new PrismaClient({ adapter });
  try {
    // 1. Sync AI models from registry
    const { syncAIModelsToDatabase } = await import('../services/AIModelRegistry.js');
    await syncAIModelsToDatabase(prisma as any);

    // 2. Seed curator user
    const user = await prisma.user.upsert({
      where:  { email: 'curator@arula.dev' },
      update: {},
      create: { email: 'curator@arula.dev', name: 'curator' }
    });

    // 3. Seed 'system' project
    await prisma.project.upsert({
      where: { id: 'system' },
      update: {},
      create: {
        id: 'system',
        name: 'System',
        userId: user.id
      }
    });
  } finally {
    await prisma.$disconnect();
  }
}
