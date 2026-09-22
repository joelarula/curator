import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function ensureCuratorMariadbSchema(pool: any): Promise<void> {
  const ddl = [
    `CREATE TABLE IF NOT EXISTS User (
      id VARCHAR(191) PRIMARY KEY,
      email VARCHAR(191) NOT NULL UNIQUE,
      name VARCHAR(191),
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS Project (
      id VARCHAR(191) PRIMARY KEY,
      name VARCHAR(191) NOT NULL,
      userId VARCHAR(191) NOT NULL,
      existent BOOLEAN DEFAULT TRUE,
      deletedAt DATETIME,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_project_user_existent (userId, existent)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS Role (
      id VARCHAR(191) PRIMARY KEY,
      name VARCHAR(191) NOT NULL UNIQUE,
      description TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS RoleInheritance (
      parentId VARCHAR(191) NOT NULL,
      subRoleId VARCHAR(191) NOT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (parentId, subRoleId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS Tool (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(191) NOT NULL UNIQUE,
      description TEXT,
      version VARCHAR(191),
      accessLevel VARCHAR(191) DEFAULT 'safe_write',
      requiresConfirmation BOOLEAN DEFAULT FALSE,
      enabled BOOLEAN DEFAULT TRUE,
      existent BOOLEAN DEFAULT TRUE,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_tool_existent (existent)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS Script (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(191) NOT NULL UNIQUE,
      body LONGTEXT,
      toolCalls JSON,
      ast JSON,
      userId VARCHAR(191),
      projectId VARCHAR(191),
      existent BOOLEAN DEFAULT TRUE,
      deletedAt DATETIME,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_script_existent (existent)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS Agent (
      id VARCHAR(191) PRIMARY KEY,
      name VARCHAR(191) NOT NULL UNIQUE,
      scriptId INT,
      schedule VARCHAR(191) DEFAULT '0 * * * *',
      lastPolledAt DATETIME,
      userId VARCHAR(191) NOT NULL,
      projectId VARCHAR(191),
      enabled BOOLEAN DEFAULT TRUE,
      existent BOOLEAN DEFAULT TRUE,
      deletedAt DATETIME,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_agent_existent (existent)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS Conversation (
      id INT AUTO_INCREMENT PRIMARY KEY,
      externalId VARCHAR(191) NOT NULL UNIQUE,
      userId VARCHAR(191) NOT NULL,
      projectId VARCHAR(191),
      metadata JSON,
      existent BOOLEAN DEFAULT TRUE,
      deletedAt DATETIME,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_conv_existent (existent)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS Request (
      id INT AUTO_INCREMENT PRIMARY KEY,
      status VARCHAR(50) DEFAULT 'NEW',
      toolName VARCHAR(191),
      retryCount INT DEFAULT 0,
      scriptId INT,
      aiModelId INT,
      userId VARCHAR(191) NOT NULL,
      projectId VARCHAR(191),
      ast JSON,
      context JSON,
      conversationId INT NOT NULL,
      agentId VARCHAR(191),
      scheduledAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      executionScheduled DATETIME DEFAULT CURRENT_TIMESTAMP,
      lockedBy VARCHAR(191),
      lockedAt DATETIME,
      deletedAt DATETIME,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      parentId INT,
      existent BOOLEAN DEFAULT TRUE,
      INDEX idx_req_status_existent (status, existent)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS Response (
      id INT AUTO_INCREMENT PRIMARY KEY,
      requestId INT NOT NULL,
      conversationId INT NOT NULL,
      content LONGTEXT NOT NULL,
      aiModelId INT,
      projectId VARCHAR(191),
      existent BOOLEAN DEFAULT TRUE,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_resp_existent (existent)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
  ];

  for (const sql of ddl) {
    try {
      await pool.query(sql);
    } catch (_) {}
  }
}

export async function provisionMariadbDb(connectionUrl: string = process.env.CURATOR_DATABASE_URL || process.env.DATABASE_URL || ''): Promise<any> {
  if (!connectionUrl) {
    throw new Error('MariaDB connection URL is required (set CURATOR_DATABASE_URL or DATABASE_URL in environment)');
  }
  let PrismaMariaDb: any;
  let mariadbMod: any;
  try {
    // @ts-ignore
    const adapterMod = await import('@prisma/adapter-mariadb');
    PrismaMariaDb = adapterMod.PrismaMariaDb || (adapterMod as any).default?.PrismaMariaDb;
    // @ts-ignore
    mariadbMod = await import('mariadb');
  } catch (err: any) {
    throw new Error(`MariaDB adapter dependencies not found (@prisma/adapter-mariadb / mariadb): ${err?.message || err}`);
  }
  const mariadb = mariadbMod.default || mariadbMod;

  const url = new URL(connectionUrl);
  const pool = mariadb.createPool({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: url.username,
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
    connectionLimit: 10,
  });

  // Ensure Curator schema exists in MariaDB before Prisma connects
  await ensureCuratorMariadbSchema(pool);

  const adapter = new PrismaMariaDb(pool as any);
  
  let MariadbPrismaClient: any;
  const potentialPaths = [
    path.join(__dirname, '../generated/prisma-mariadb/index.js'),
    path.join(__dirname, '../../src/generated/prisma-mariadb/index.js'),
    path.join(__dirname, '../../../curator/src/generated/prisma-mariadb/index.js'),
  ];
  for (const p of potentialPaths) {
    if (fs.existsSync(p)) {
      const mod = await import(pathToFileURL(p).href);
      MariadbPrismaClient = mod.PrismaClient;
      break;
    }
  }
  if (!MariadbPrismaClient) {
    const mod = await import('@prisma/client');
    MariadbPrismaClient = (mod as any).PrismaClient;
  }

  const prisma = new (MariadbPrismaClient as any)({ adapter });

  // Ensure system user and project exist
  const user = await prisma.user.upsert({
    where: { email: 'system@local' },
    update: {},
    create: { id: '1', name: 'System User', email: 'system@local' },
  });

  await prisma.project.upsert({
    where: { id: '1' },
    update: {},
    create: { id: '1', name: 'Keeris', userId: user.id },
  });

  return prisma;
}
