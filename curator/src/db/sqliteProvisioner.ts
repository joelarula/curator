import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve project root dynamically by walking up until we find package.json and prisma/sqlite folder
let root = __dirname;
while (root !== path.dirname(root)) {
  if (fs.existsSync(path.join(root, 'package.json')) && fs.existsSync(path.join(root, 'prisma', 'sqlite', 'schema.prisma'))) {
    break;
  }
  root = path.dirname(root);
}
const CURATOR_ROOT = root;
const DATA_DIR = path.join(CURATOR_ROOT, 'data');

export async function provisionSqliteDb(name: string, forceReset: boolean = false, options: { databasePath?: string } = {}): Promise<PrismaClient> {
  // Validate name (alphanumeric, hyphens, underscores only)
  if (!/^[\w-]+$/.test(name)) {
    throw new Error(`[Curator CLI] Invalid database name "${name}". Use letters, numbers, hyphens or underscores only.`);
  }

  const dbPath = options.databasePath ? path.resolve(options.databasePath) : path.join(DATA_DIR, `${name}.db`);
  const dbDirectory = path.dirname(dbPath);
  if (!fs.existsSync(dbDirectory)) {
    fs.mkdirSync(dbDirectory, { recursive: true });
    console.log(`[Curator CLI] Created data directory: ${DATA_DIR}`);
  }

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

  const hasSchema = !isNew && (() => {
    let db: DatabaseSync | undefined;
    try {
      db = new DatabaseSync(dbPath, { readOnly: true });
      return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='User'").get());
    } catch {
      return false;
    } finally {
      db?.close();
    }
  })();

  if (isNew || !hasSchema || forceReset) {
    console.log(`[Curator CLI] 🗄️ Provisioning new database: ${name}`);
    console.log(`[Curator CLI] Applying schema...`);
    const sqliteSchemaPath = path.join(CURATOR_ROOT, 'prisma', 'sqlite', 'schema.prisma');
    const pushFlags = forceReset ? '--force-reset' : '--accept-data-loss';
    execSync(
      `npx prisma db push ${pushFlags} --schema="${sqliteSchemaPath}" --url="${dbUrl}"`,
      {
        stdio: 'inherit',
        cwd: CURATOR_ROOT,
        env: { ...process.env, DATABASE_URL: dbUrl, PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: 'yes' }
      }
    );
    console.log(`[Curator CLI] ✓ Database ready: ${dbPath}`);
  } else {
    console.log(`[Curator CLI] 🗄️ Using existing database: ${name}`);
  }

  // Return a PrismaClient pointed at the SQLite file via better-sqlite3 adapter.
  const { PrismaClient: SqlitePrismaClient } = await import('../generated/prisma-sqlite/index.js');
  const adapter = new PrismaBetterSqlite3({ url: dbUrl });
  const prisma = new SqlitePrismaClient({ adapter }) as any;

  // Ensure system user and project exist
  const user = await prisma.user.upsert({
    where: { email: 'system@local' },
    update: {},
    create: { id: '1', name: 'System User', email: 'system@local' }
  });

  await prisma.project.upsert({
    where: { id: '1' },
    update: {},
    create: { id: '1', name: 'System Project', userId: user.id }
  });

  return prisma;
}
