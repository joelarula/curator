import Database from 'better-sqlite3';
import mysql from 'mysql2/promise';
import fs from 'node:fs';

async function migrate() {
  const sqlitePath = './data/curator.db';
  if (!fs.existsSync(sqlitePath)) {
    console.log('No sqlite curator.db found, skipping data copy.');
    return;
  }

  console.log('Migrating existing tasks & history from SQLite data/curator.db to MariaDB curator...');
  const sdb = new Database(sqlitePath);
  const mdb = await mysql.createConnection('mysql://curator:curator_secret@192.168.1.110:3306/curator');

  // Disable FK checks during copy
  await mdb.query('SET FOREIGN_KEY_CHECKS = 0');

  // 1. Migrate Users
  const users = sdb.prepare('SELECT * FROM User').all();
  for (const u of users) {
    await mdb.query(
      'INSERT INTO User (id, email, name, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name)',
      [u.id, u.email, u.name, new Date(u.createdAt), new Date(u.updatedAt)]
    );
  }
  console.log(`Migrated ${users.length} Users.`);

  // 2. Migrate Projects
  const projects = sdb.prepare('SELECT * FROM Project').all();
  for (const p of projects) {
    await mdb.query(
      'INSERT INTO Project (id, name, userId, existent, deletedAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name)',
      [p.id, p.name, p.userId, p.existent ? 1 : 0, p.deletedAt ? new Date(p.deletedAt) : null, new Date(p.createdAt), new Date(p.updatedAt)]
    );
  }
  console.log(`Migrated ${projects.length} Projects.`);

  // 3. Migrate Conversations
  const convs = sdb.prepare('SELECT * FROM Conversation').all();
  for (const c of convs) {
    await mdb.query(
      'INSERT INTO Conversation (id, externalId, userId, projectId, metadata, existent, deletedAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE userId=VALUES(userId)',
      [c.id, c.externalId, c.userId, c.projectId, c.metadata, c.existent ? 1 : 0, c.deletedAt ? new Date(c.deletedAt) : null, new Date(c.createdAt), new Date(c.updatedAt)]
    );
  }
  console.log(`Migrated ${convs.length} Conversations.`);

  // 4. Migrate Scripts
  const scripts = sdb.prepare('SELECT * FROM Script').all();
  for (const s of scripts) {
    await mdb.query(
      'INSERT INTO Script (id, name, body, toolCalls, ast, userId, projectId, existent, deletedAt, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE ast=VALUES(ast)',
      [s.id, s.name, s.body, s.toolCalls, s.ast, s.userId, s.projectId, s.existent ? 1 : 0, s.deletedAt ? new Date(s.deletedAt) : null, new Date(s.createdAt)]
    );
  }
  console.log(`Migrated ${scripts.length} Scripts.`);

  // 5. Migrate Requests in batches
  const reqCount = sdb.prepare('SELECT COUNT(*) as c FROM Request').get().c;
  console.log(`Migrating ${reqCount} Requests in batches of 500...`);
  const batchSize = 500;
  for (let offset = 0; offset < reqCount; offset += batchSize) {
    const batch = sdb.prepare('SELECT * FROM Request LIMIT ? OFFSET ?').all(batchSize, offset);
    for (const r of batch) {
      await mdb.query(
        `INSERT INTO Request (id, status, toolName, retryCount, scriptId, aiModelId, userId, projectId, ast, context, conversationId, agentId, scheduledAt, executionScheduled, lockedBy, lockedAt, deletedAt, createdAt, updatedAt, parentId, existent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status=VALUES(status)`,
        [
          r.id, r.status, r.toolName, r.retryCount, r.scriptId, r.aiModelId, r.userId, r.projectId,
          r.ast, r.context, r.conversationId, r.agentId,
          r.scheduledAt ? new Date(r.scheduledAt) : null,
          r.executionScheduled ? new Date(r.executionScheduled) : null,
          r.lockedBy, r.lockedAt ? new Date(r.lockedAt) : null,
          r.deletedAt ? new Date(r.deletedAt) : null,
          new Date(r.createdAt), new Date(r.updatedAt),
          r.parentId, r.existent ? 1 : 0
        ]
      );
    }
  }
  console.log('All Requests migrated.');

  // 6. Migrate Responses in batches
  const respCount = sdb.prepare('SELECT COUNT(*) as c FROM Response').get().c;
  console.log(`Migrating ${respCount} Responses in batches of 500...`);
  for (let offset = 0; offset < respCount; offset += batchSize) {
    const batch = sdb.prepare('SELECT * FROM Response LIMIT ? OFFSET ?').all(batchSize, offset);
    for (const res of batch) {
      await mdb.query(
        `INSERT INTO Response (id, requestId, conversationId, content, aiModelId, projectId, existent, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE content=VALUES(content)`,
        [
          res.id, res.requestId, res.conversationId, res.content, res.aiModelId, res.projectId,
          res.existent ? 1 : 0, new Date(res.createdAt)
        ]
      );
    }
  }
  console.log('All Responses migrated.');

  await mdb.query('SET FOREIGN_KEY_CHECKS = 1');
  await mdb.end();
  sdb.close();
  console.log('✓ Migration of SQLite data to MariaDB curator complete!');
}

migrate().catch(console.error);
