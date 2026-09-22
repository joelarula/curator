const mysql = require('mysql2/promise');

async function createTables() {
  const conn = await mysql.createConnection('mysql://curator:curator_secret@192.168.1.110:3306/curator');
  console.log('Connected to MariaDB `curator`. Creating clean tables...');

  await conn.query(`
    CREATE TABLE IF NOT EXISTS User (
      id VARCHAR(191) PRIMARY KEY,
      email VARCHAR(191) NOT NULL UNIQUE,
      name VARCHAR(191),
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS Project (
      id VARCHAR(191) PRIMARY KEY,
      name VARCHAR(191) NOT NULL,
      userId VARCHAR(191) NOT NULL,
      existent BOOLEAN DEFAULT TRUE,
      deletedAt DATETIME,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_project_user_existent (userId, existent)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS Role (
      id VARCHAR(191) PRIMARY KEY,
      name VARCHAR(191) NOT NULL UNIQUE,
      description TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS RoleInheritance (
      parentId VARCHAR(191) NOT NULL,
      subRoleId VARCHAR(191) NOT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (parentId, subRoleId),
      FOREIGN KEY (parentId) REFERENCES Role(id) ON DELETE CASCADE,
      FOREIGN KEY (subRoleId) REFERENCES Role(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS Permission (
      id VARCHAR(191) PRIMARY KEY,
      name VARCHAR(191) NOT NULL UNIQUE,
      description TEXT,
      toolName VARCHAR(191),
      accessLevel VARCHAR(191),
      requiresConfirmation BOOLEAN DEFAULT FALSE,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS RolePermission (
      roleId VARCHAR(191) NOT NULL,
      permissionId VARCHAR(191) NOT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (roleId, permissionId),
      FOREIGN KEY (roleId) REFERENCES Role(id) ON DELETE CASCADE,
      FOREIGN KEY (permissionId) REFERENCES Permission(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS UserRole (
      userId VARCHAR(191) NOT NULL,
      roleId VARCHAR(191) NOT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (userId, roleId),
      FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE,
      FOREIGN KEY (roleId) REFERENCES Role(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS Tool (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS Script (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS Agent (
      id VARCHAR(191) PRIMARY KEY,
      name VARCHAR(191) NOT NULL UNIQUE,
      scriptId INT,
      schedule VARCHAR(191) DEFAULT 'every 10 minutes',
      lastPolledAt DATETIME,
      userId VARCHAR(191) NOT NULL,
      projectId VARCHAR(191),
      enabled BOOLEAN DEFAULT TRUE,
      existent BOOLEAN DEFAULT TRUE,
      deletedAt DATETIME,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (scriptId) REFERENCES Script(id) ON DELETE SET NULL,
      FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE,
      INDEX idx_agent_existent (existent)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS AgentRole (
      agentId VARCHAR(191) NOT NULL,
      roleId VARCHAR(191) NOT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (agentId, roleId),
      FOREIGN KEY (agentId) REFERENCES Agent(id) ON DELETE CASCADE,
      FOREIGN KEY (roleId) REFERENCES Role(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS Conversation (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS AIModel (
      id INT AUTO_INCREMENT PRIMARY KEY,
      shortName VARCHAR(191) NOT NULL UNIQUE,
      name VARCHAR(191) NOT NULL UNIQUE,
      provider VARCHAR(191) NOT NULL,
      type VARCHAR(191) NOT NULL,
      version VARCHAR(191),
      url TEXT,
      deletedAt DATETIME,
      existent BOOLEAN DEFAULT TRUE,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_aimodel_existent (existent)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS Request (
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
      FOREIGN KEY (scriptId) REFERENCES Script(id) ON DELETE SET NULL,
      FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE,
      FOREIGN KEY (conversationId) REFERENCES Conversation(id) ON DELETE CASCADE,
      FOREIGN KEY (agentId) REFERENCES Agent(id) ON DELETE SET NULL,
      INDEX idx_req_status_existent (status, existent)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS Response (
      id INT AUTO_INCREMENT PRIMARY KEY,
      requestId INT NOT NULL,
      conversationId INT NOT NULL,
      content LONGTEXT NOT NULL,
      aiModelId INT,
      projectId VARCHAR(191),
      existent BOOLEAN DEFAULT TRUE,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (requestId) REFERENCES Request(id) ON DELETE CASCADE,
      FOREIGN KEY (conversationId) REFERENCES Conversation(id) ON DELETE CASCADE,
      INDEX idx_resp_existent (existent)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS Task (
      id VARCHAR(191) PRIMARY KEY,
      workflowName VARCHAR(191) NOT NULL,
      status VARCHAR(50) DEFAULT 'PENDING',
      inputData JSON NOT NULL,
      outputData JSON,
      sessionId VARCHAR(191),
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS WorkflowSession (
      id VARCHAR(191) PRIMARY KEY,
      conversationId INT NOT NULL UNIQUE,
      state JSON NOT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (conversationId) REFERENCES Conversation(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS WorkflowCheckpoint (
      id VARCHAR(191) PRIMARY KEY,
      sessionId VARCHAR(191) NOT NULL,
      nodeId VARCHAR(191) NOT NULL,
      status VARCHAR(50) NOT NULL,
      result JSON,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sessionId) REFERENCES WorkflowSession(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  const [tables] = await conn.query('SHOW TABLES');
  console.log('✓ Clean tables created in MariaDB `curator`:', tables.map(r => Object.values(r)[0]));
  await conn.end();
}

createTables().catch(console.error);
