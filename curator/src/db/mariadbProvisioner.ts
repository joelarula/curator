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
      name VARCHAR(191) NOT NULL,
      description TEXT,
      projectId VARCHAR(191),
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `ALTER TABLE Role ADD COLUMN IF NOT EXISTS projectId VARCHAR(191);`,

    `CREATE TABLE IF NOT EXISTS UserRole (
      id INT AUTO_INCREMENT PRIMARY KEY,
      userId VARCHAR(191) NOT NULL,
      roleId VARCHAR(191) NOT NULL,
      projectId VARCHAR(191),
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY idx_user_role_project (userId, roleId, projectId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS ToolRole (
      id INT AUTO_INCREMENT PRIMARY KEY,
      toolId INT NOT NULL,
      roleId VARCHAR(191) NOT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY idx_tool_role (toolId, roleId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS Permission (
      id VARCHAR(191) PRIMARY KEY,
      name VARCHAR(191) NOT NULL UNIQUE,
      description TEXT,
      toolName VARCHAR(191),
      accessLevel VARCHAR(191),
      requiresConfirmation BOOLEAN DEFAULT FALSE,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS RolePermission (
      roleId VARCHAR(191) NOT NULL,
      permissionId VARCHAR(191) NOT NULL,
      PRIMARY KEY (roleId, permissionId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS ProjectRole (
      id INT AUTO_INCREMENT PRIMARY KEY,
      projectId VARCHAR(191) NOT NULL,
      roleId VARCHAR(191) NOT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY idx_project_role (projectId, roleId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS AgentRole (
      id INT AUTO_INCREMENT PRIMARY KEY,
      agentId VARCHAR(191) NOT NULL,
      roleId VARCHAR(191) NOT NULL,
      UNIQUE KEY idx_agent_role (agentId, roleId)
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
      requiredRole VARCHAR(191),
      requiresConfirmation BOOLEAN DEFAULT FALSE,
      enabled BOOLEAN DEFAULT TRUE,
      existent BOOLEAN DEFAULT TRUE,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_tool_existent (existent)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `ALTER TABLE Tool ADD COLUMN IF NOT EXISTS requiredRole VARCHAR(191);`,

    // Remote MCP providers; remote tools are Tool rows with origin='remote'
    `CREATE TABLE IF NOT EXISTS McpServer (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(191) NOT NULL,
      url TEXT NOT NULL,
      transport VARCHAR(191) NOT NULL DEFAULT 'streamable-http',
      authService VARCHAR(191),
      status VARCHAR(191) NOT NULL DEFAULT 'registered',
      lastError TEXT,
      serverInfo JSON,
      instructions TEXT,
      expectations JSON,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      lastSyncedAt DATETIME(3),
      projectId VARCHAR(191) NOT NULL,
      createdBy VARCHAR(191),
      existent BOOLEAN DEFAULT TRUE,
      createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE INDEX McpServer_projectId_name_key (projectId, name),
      INDEX McpServer_projectId_existent_idx (projectId, existent),
      CONSTRAINT McpServer_projectId_fkey FOREIGN KEY (projectId) REFERENCES Project(id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS McpResource (
      id INT AUTO_INCREMENT PRIMARY KEY,
      mcpServerId INT NOT NULL,
      uri VARCHAR(512) NOT NULL,
      isTemplate BOOLEAN NOT NULL DEFAULT FALSE,
      name VARCHAR(191) NOT NULL,
      title VARCHAR(191),
      description TEXT,
      mimeType VARCHAR(191),
      size INT,
      annotations JSON,
      existent BOOLEAN DEFAULT TRUE,
      createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE INDEX McpResource_mcpServerId_uri_key (mcpServerId, uri),
      INDEX McpResource_mcpServerId_existent_idx (mcpServerId, existent),
      CONSTRAINT McpResource_mcpServerId_fkey FOREIGN KEY (mcpServerId) REFERENCES McpServer(id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS McpPrompt (
      id INT AUTO_INCREMENT PRIMARY KEY,
      mcpServerId INT NOT NULL,
      name VARCHAR(191) NOT NULL,
      title VARCHAR(191),
      description TEXT,
      arguments JSON,
      existent BOOLEAN DEFAULT TRUE,
      createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE INDEX McpPrompt_mcpServerId_name_key (mcpServerId, name),
      INDEX McpPrompt_mcpServerId_existent_idx (mcpServerId, existent),
      CONSTRAINT McpPrompt_mcpServerId_fkey FOREIGN KEY (mcpServerId) REFERENCES McpServer(id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `ALTER TABLE McpServer ADD COLUMN IF NOT EXISTS expectations JSON;`,
    `ALTER TABLE Tool ADD COLUMN IF NOT EXISTS origin VARCHAR(191) NOT NULL DEFAULT 'local';`,
    `ALTER TABLE Tool ADD COLUMN IF NOT EXISTS mcpServerId INT;`,
    `ALTER TABLE Tool ADD COLUMN IF NOT EXISTS remoteName VARCHAR(191);`,
    `ALTER TABLE Tool ADD COLUMN IF NOT EXISTS projectId VARCHAR(191);`,
    `ALTER TABLE Tool ADD COLUMN IF NOT EXISTS inputSchema JSON;`,
    `ALTER TABLE Tool ADD COLUMN IF NOT EXISTS annotations JSON;`,
    `CREATE INDEX IF NOT EXISTS Tool_origin_idx ON Tool (origin);`,
    `CREATE INDEX IF NOT EXISTS Tool_projectId_idx ON Tool (projectId);`,
    `CREATE UNIQUE INDEX IF NOT EXISTS Tool_mcpServerId_remoteName_key ON Tool (mcpServerId, remoteName);`,
    `ALTER TABLE Tool ADD CONSTRAINT Tool_mcpServerId_fkey FOREIGN KEY (mcpServerId) REFERENCES McpServer(id) ON DELETE CASCADE ON UPDATE CASCADE;`,
    `ALTER TABLE Tool ADD CONSTRAINT Tool_projectId_fkey FOREIGN KEY (projectId) REFERENCES Project(id) ON DELETE CASCADE ON UPDATE CASCADE;`,

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
      scheduledAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      executionScheduled DATETIME DEFAULT CURRENT_TIMESTAMP,
      priority INT DEFAULT 0,
      notifyId INT,
      pendingDependencies INT DEFAULT 0,
      lockedBy VARCHAR(191),
      lockedAt DATETIME,
      deletedAt DATETIME,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      parentId INT,
      existent BOOLEAN DEFAULT TRUE,
      INDEX idx_req_status_existent (status, existent)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `ALTER TABLE Request ADD COLUMN IF NOT EXISTS priority INT DEFAULT 0;`,
    `ALTER TABLE Request ADD COLUMN IF NOT EXISTS notifyId INT;`,
    `ALTER TABLE Request ADD COLUMN IF NOT EXISTS pendingDependencies INT DEFAULT 0;`,
    `ALTER TABLE User ADD COLUMN IF NOT EXISTS googleId VARCHAR(191) UNIQUE;`,

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
    const adapterMod = await import('@prisma/adapter-mariadb');
    PrismaMariaDb = adapterMod.PrismaMariaDb || (adapterMod as any).default?.PrismaMariaDb;
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
    connectionLimit: 25,
    connectTimeout: 10000,
    acquireTimeout: 30000,
    idleTimeout: 60000,
    minimumIdle: 2,
    allowPublicKeyRetrieval: true,
  });

  // Ensure Curator schema exists in MariaDB before Prisma connects
  await ensureCuratorMariadbSchema(pool);

  const adapter = new PrismaMariaDb(pool as any);
  
  let MariadbPrismaClient: any;
  const potentialPaths = [
    path.join(__dirname, '../generated/prisma-mariadb/index.js'),
    path.join(__dirname, '../../src/generated/prisma-mariadb/index.js'),
    path.join(__dirname, '../../../src/generated/prisma-mariadb/index.js'),
    path.join(__dirname, '../../../curator/src/generated/prisma-mariadb/index.js'),
    path.join(__dirname, '../../../../curator/src/generated/prisma-mariadb/index.js'),
    path.join(process.cwd(), 'src/generated/prisma-mariadb/index.js'),
    path.join(process.cwd(), 'curator/src/generated/prisma-mariadb/index.js'),
    path.join(process.cwd(), '../../curator/src/generated/prisma-mariadb/index.js'),
    path.join(process.cwd(), '../curator/src/generated/prisma-mariadb/index.js'),
  ];
  for (const p of potentialPaths) {
    if (fs.existsSync(p)) {
      const mod = await import(pathToFileURL(p).href);
      MariadbPrismaClient = mod.PrismaClient;
      if (MariadbPrismaClient) break;
    }
  }
  if (!MariadbPrismaClient) {
    try {
      const mod = await import('@prisma/client');
      MariadbPrismaClient = mod.PrismaClient;
    } catch (_) {}
  }
  if (!MariadbPrismaClient) {
    throw new Error(
      `MariaDB Prisma Client not found. Checked: ${potentialPaths.join(', ')}. Please run: pnpm --filter @curator/agent-server run prisma:mariadb:generate`
    );
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
