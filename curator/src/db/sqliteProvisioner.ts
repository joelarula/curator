import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve project root dynamically by walking up until we find package.json and prisma folder
let root = __dirname;
while (root !== path.dirname(root)) {
  if (fs.existsSync(path.join(root, 'package.json')) && fs.existsSync(path.join(root, 'prisma', 'schema.prisma'))) {
    break;
  }
  root = path.dirname(root);
}
const CURATOR_ROOT = root;
const DATA_DIR = path.join(CURATOR_ROOT, 'data');

export async function provisionSqliteDb(name: string, forceReset: boolean = false): Promise<PrismaClient> {
  // Validate name (alphanumeric, hyphens, underscores only)
  if (!/^[\w-]+$/.test(name)) {
    throw new Error(`[Curator CLI] Invalid database name "${name}". Use letters, numbers, hyphens or underscores only.`);
  }

  // Ensure data/ directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`[Curator CLI] Created data directory: ${DATA_DIR}`);
  }

  const dbPath = path.join(DATA_DIR, `${name}.db`);
  const dbUrl = `file:${dbPath}`;

  if (forceReset && fs.existsSync(dbPath)) {
    console.log(`[Curator CLI] 🗄️ Force resetting database: ${name}`);
    try {
      fs.unlinkSync(dbPath);
    } catch (err: any) {
      console.warn(`[Curator CLI] Warning: Failed to delete database file: ${err.message}`);
    }
  }

  const isNew = !fs.existsSync(dbPath);

  if (isNew) {
    console.log(`[Curator CLI] 🗄️ Provisioning new database: ${name}`);
    console.log(`[Curator CLI] Applying schema...`);
    execSync(
      `npx prisma db push --accept-data-loss`,
      {
        stdio: 'inherit',
        cwd: CURATOR_ROOT,
        env: { ...process.env, DATABASE_URL: dbUrl }
      }
    );
    console.log(`[Curator CLI] ✓ Database ready: ${dbPath}`);
  } else {
    console.log(`[Curator CLI] 🗄️ Using existing database: ${name}`);
  }

  // Return a PrismaClient pointed at the SQLite file via better-sqlite3 adapter.
  const adapter = new PrismaBetterSqlite3({ url: dbUrl });
  const prisma = new PrismaClient({ adapter });

  // Ensure system user and project exist
  await prisma.user.upsert({
    where: { id: 'system' },
    update: {},
    create: { id: 'system', name: 'System User', email: 'system@example.com' }
  });

  await prisma.project.upsert({
    where: { id: 'system' },
    update: {},
    create: { id: 'system', name: 'System Project', userId: 'system' }
  });

  return prisma;
}
