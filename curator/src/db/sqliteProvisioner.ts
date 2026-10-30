import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { PrismaClient } from '@prisma/client';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findCuratorRootAndSchema(): { root: string; schemaPath: string } {
  let cur = __dirname;
  while (cur !== path.dirname(cur)) {
    const candidates = [
      path.join(cur, 'prisma-sqlite', 'schema.prisma'),
      path.join(cur, 'curator', 'prisma-sqlite', 'schema.prisma'),
      path.join(cur, 'server', 'prisma', 'sqlite', 'schema.prisma'),
      path.join(cur, 'prisma', 'sqlite', 'schema.prisma'),
    ];
    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        return { root: path.dirname(path.dirname(cand)), schemaPath: cand };
      }
    }
    cur = path.dirname(cur);
  }
  const fallback = path.resolve(__dirname, '../../../curator/prisma-sqlite/schema.prisma');
  return { root: path.resolve(__dirname, '../../..'), schemaPath: fallback };
}

const { root: CURATOR_ROOT, schemaPath: SQLITE_SCHEMA_PATH } = findCuratorRootAndSchema();
const DATA_DIR = path.join(CURATOR_ROOT, 'data');

/**
 * Brings an existing database up to the remote-MCP model (McpServer/McpResource/McpPrompt,
 * Tool.origin & friends). DDL mirrors `prisma migrate diff` for prisma-sqlite; every step is idempotent.
 */
export function migrateMcpTables(db: DatabaseSync): void {
  const statements = [
    `CREATE TABLE IF NOT EXISTS "McpServer" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "name" TEXT NOT NULL,
      "url" TEXT NOT NULL,
      "transport" TEXT NOT NULL DEFAULT 'streamable-http',
      "authService" TEXT,
      "status" TEXT NOT NULL DEFAULT 'registered',
      "lastError" TEXT,
      "serverInfo" JSONB,
      "instructions" TEXT,
      "enabled" BOOLEAN NOT NULL DEFAULT true,
      "lastSyncedAt" DATETIME,
      "projectId" TEXT NOT NULL,
      "createdBy" TEXT,
      "existent" BOOLEAN DEFAULT true,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "McpServer_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );`,
    // Server names are unique per project, not globally
    `DROP INDEX IF EXISTS "McpServer_name_key";`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "McpServer_projectId_name_key" ON "McpServer"("projectId", "name");`,
    `CREATE INDEX IF NOT EXISTS "McpServer_projectId_existent_idx" ON "McpServer"("projectId", "existent");`,
    `CREATE TABLE IF NOT EXISTS "McpResource" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "mcpServerId" INTEGER NOT NULL,
      "uri" TEXT NOT NULL,
      "isTemplate" BOOLEAN NOT NULL DEFAULT false,
      "name" TEXT NOT NULL,
      "title" TEXT,
      "description" TEXT,
      "mimeType" TEXT,
      "size" INTEGER,
      "annotations" JSONB,
      "existent" BOOLEAN DEFAULT true,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "McpResource_mcpServerId_fkey" FOREIGN KEY ("mcpServerId") REFERENCES "McpServer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "McpResource_mcpServerId_uri_key" ON "McpResource"("mcpServerId", "uri");`,
    `CREATE INDEX IF NOT EXISTS "McpResource_mcpServerId_existent_idx" ON "McpResource"("mcpServerId", "existent");`,
    `CREATE TABLE IF NOT EXISTS "McpPrompt" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "mcpServerId" INTEGER NOT NULL,
      "name" TEXT NOT NULL,
      "title" TEXT,
      "description" TEXT,
      "arguments" JSONB,
      "existent" BOOLEAN DEFAULT true,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "McpPrompt_mcpServerId_fkey" FOREIGN KEY ("mcpServerId") REFERENCES "McpServer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "McpPrompt_mcpServerId_name_key" ON "McpPrompt"("mcpServerId", "name");`,
    `CREATE INDEX IF NOT EXISTS "McpPrompt_mcpServerId_existent_idx" ON "McpPrompt"("mcpServerId", "existent");`,
  ];
  for (const sql of statements) {
    try { db.exec(sql); } catch (_) {}
  }

  const toolColumns = new Set(
    (db.prepare(`PRAGMA table_info("Tool")`).all() as { name: string }[]).map((c) => c.name)
  );
  const addToolColumns: [string, string][] = [
    ['origin', `"origin" TEXT NOT NULL DEFAULT 'local'`],
    ['mcpServerId', `"mcpServerId" INTEGER REFERENCES "McpServer" ("id") ON DELETE CASCADE ON UPDATE CASCADE`],
    ['remoteName', `"remoteName" TEXT`],
    ['projectId', `"projectId" TEXT REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE`],
    ['inputSchema', `"inputSchema" JSONB`],
    ['annotations', `"annotations" JSONB`],
  ];
  if (toolColumns.size > 0) {
    for (const [name, definition] of addToolColumns) {
      if (!toolColumns.has(name)) db.exec(`ALTER TABLE "Tool" ADD COLUMN ${definition};`);
    }
    db.exec(`DROP INDEX IF EXISTS "Tool_mcpServerId_idx";`);
    db.exec(`CREATE INDEX IF NOT EXISTS "Tool_origin_idx" ON "Tool"("origin");`);
    db.exec(`CREATE INDEX IF NOT EXISTS "Tool_projectId_idx" ON "Tool"("projectId");`);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS "Tool_mcpServerId_remoteName_key" ON "Tool"("mcpServerId", "remoteName");`);
  }
}

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

  const normalizedPath = dbPath.replace(/\\/g, '/');
  const dbUrl = `file:${normalizedPath}`;

  if (forceReset && fs.existsSync(dbPath)) {
    console.log(`[Curator CLI] 🗄️ Force resetting database: ${name}`);
    try {
      fs.unlinkSync(dbPath);
    } catch (err: any) {
      console.warn(`[Curator CLI] Warning: Failed to delete database file: ${err.message}`);
    }
  }

  const isNew = !fs.existsSync(dbPath) || (fs.existsSync(dbPath) && fs.statSync(dbPath).size === 0);

  const hasSchema = !isNew && (() => {
    let db: DatabaseSync | undefined;
    try {
      db = new DatabaseSync(dbPath, { readOnly: true });
      return Boolean(
        db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='User'").get() &&
        db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='EventSubscription'").get()
      );
    } catch {
      // If the file exists with content (> 0 bytes) but was busy/locked during check,
      // it is already provisioned — do not re-push schema or trigger conflicting push
      return fs.existsSync(dbPath) && fs.statSync(dbPath).size > 0;
    } finally {
      db?.close();
    }
  })();

  if (isNew || !hasSchema || forceReset) {
    console.log(`[Curator CLI] 🗄️ Provisioning new database: ${name}`);
    console.log(`[Curator CLI] Applying schema...`);
    const sqliteSchemaPath = SQLITE_SCHEMA_PATH;
    const pushFlags = forceReset ? '--force-reset --accept-data-loss' : '--accept-data-loss';
    try {
      execSync(
        `npx prisma db push ${pushFlags} --schema="${sqliteSchemaPath}" --url="${dbUrl}"`,
        {
          stdio: 'inherit',
          cwd: CURATOR_ROOT,
          env: { ...process.env, DATABASE_URL: dbUrl, PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: 'yes' }
        }
      );
    } catch {
      // Fallback: If direct push fails (e.g. SMB network share FlushFileBuffers error 1450),
      // push schema to a local temp database file and copy it into place.
      console.log(`[Curator CLI] Direct push failed (SMB / I/O restriction), using local staging file...`);
      const tempPath = path.join(os.tmpdir(), `curator_${name}_${Date.now()}.db`);
      const tempUrl = `file:${tempPath.replace(/\\/g, '/')}`;
      execSync(
        `npx prisma db push ${pushFlags} --schema="${sqliteSchemaPath}" --url="${tempUrl}"`,
        {
          stdio: 'inherit',
          cwd: CURATOR_ROOT,
          env: { ...process.env, DATABASE_URL: tempUrl, PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: 'yes' }
        }
      );
      fs.copyFileSync(tempPath, dbPath);
      try { fs.unlinkSync(tempPath); } catch (_) {}
    }
    console.log(`[Curator CLI] ✓ Database ready: ${dbPath}`);
  } else {
    console.log(`[Curator CLI] 🗄️ Using existing database: ${name}`);
    try {
      const migDb = new DatabaseSync(dbPath);
      migDb.exec('PRAGMA synchronous = OFF;');
      try { migDb.exec('ALTER TABLE User ADD COLUMN googleId TEXT;'); } catch (_) {}
      try { migDb.exec('ALTER TABLE Script ADD COLUMN currentVersion INTEGER DEFAULT 0;'); } catch (_) {}
      try { migDb.exec('ALTER TABLE Request ADD COLUMN scriptVersion INTEGER;'); } catch (_) {}
      try {
        migDb.exec(`CREATE TABLE IF NOT EXISTS ScriptVersion (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          scriptId INTEGER NOT NULL,
          version INTEGER NOT NULL,
          ast TEXT,
          body TEXT,
          hash TEXT NOT NULL,
          createdBy TEXT,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (scriptId) REFERENCES Script(id) ON DELETE CASCADE
        );`);
        migDb.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ScriptVersion_scriptId_version_key ON ScriptVersion(scriptId, version);`);
        migDb.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ScriptVersion_scriptId_hash_key ON ScriptVersion(scriptId, hash);`);
      } catch (_) {}
      try { migDb.exec('ALTER TABLE ScriptVersion ADD COLUMN createdBy TEXT;'); } catch (_) {}
      migrateMcpTables(migDb);
      migDb.close();
    } catch (_) {}
  }

  // Return a PrismaClient pointed at the SQLite file via better-sqlite3 adapter.
  let SqlitePrismaClient: any;
  const potentialPaths = [
    path.join(CURATOR_ROOT, 'src/generated/prisma-sqlite/index.js'),
    path.join(__dirname, '../../src/generated/prisma-sqlite/index.js'),
    path.join(__dirname, '../generated/prisma-sqlite/index.js'),
    path.join(CURATOR_ROOT, 'dist/src/generated/prisma-sqlite/index.js'),
  ];
  for (const p of potentialPaths) {
    if (fs.existsSync(p)) {
      const mod = await import(pathToFileURL(p).href);
      SqlitePrismaClient = mod.PrismaClient;
      break;
    }
  }
  if (!SqlitePrismaClient) {
    const mod = await import('../generated/prisma-sqlite/index.js');
    SqlitePrismaClient = mod.PrismaClient;
  }

  const { PrismaBetterSqlite3 } = await import('@prisma/adapter-better-sqlite3');
  const adapter = new PrismaBetterSqlite3({ url: dbUrl });
  const prisma = new SqlitePrismaClient({ adapter }) as any;

  // Set PRAGMA synchronous = OFF on the connection to bypass remote FlushFileBuffers calls over network shares
  try {
    await prisma.$executeRawUnsafe('PRAGMA synchronous = OFF;');
  } catch (_) {}

  // Ensure system user and project exist
  const user = await prisma.user.upsert({
    where: { email: 'system@local' },
    update: {},
    create: { id: 'system', name: 'System User', email: 'system@local' }
  });

  await prisma.project.upsert({
    where: { id: '1' },
    update: {},
    create: { id: '1', name: 'System Project', userId: user.id }
  });

  return prisma;
}
