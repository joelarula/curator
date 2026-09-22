import { DatabaseSync } from 'node:sqlite';

export interface ISqliteDb {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: any[]): any;
    get(...params: any[]): any;
    all(...params: any[]): any[];
  };
  close?(): void;
}

export const SQLITE_CORE_DDL = `
CREATE TABLE IF NOT EXISTS User (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  name TEXT,
  email TEXT UNIQUE,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Project (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  userId INTEGER,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Conversation (
  id TEXT PRIMARY KEY,
  userId INTEGER NOT NULL,
  state TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Tool (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL,
  parametersSchema TEXT,
  sourceCode TEXT,
  version TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Agent (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  userId INTEGER NOT NULL,
  projectId INTEGER,
  enabled INTEGER DEFAULT 1,
  schedule TEXT,
  ast TEXT,
  sourceCode TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Request (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT DEFAULT 'NEW',
  toolName TEXT,
  userId INTEGER NOT NULL,
  projectId INTEGER,
  conversationId TEXT NOT NULL,
  ast TEXT,
  context TEXT,
  priority INTEGER DEFAULT 0,
  lockedBy TEXT,
  lockedAt DATETIME,
  scheduledAt DATETIME,
  retryCount INTEGER DEFAULT 0,
  notifyId INTEGER,
  pendingDependencies INTEGER DEFAULT 0,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Response (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requestId INTEGER NOT NULL,
  userId INTEGER NOT NULL,
  projectId INTEGER,
  conversationId TEXT NOT NULL,
  content TEXT,
  state TEXT,
  status TEXT DEFAULT 'COMPLETED',
  retryCount INTEGER DEFAULT 0,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  completedAt DATETIME
);

CREATE INDEX IF NOT EXISTS idx_request_status_scheduled ON Request (status, scheduledAt);
CREATE INDEX IF NOT EXISTS idx_request_priority ON Request (priority DESC, createdAt ASC);
`;

export class SqliteStorageAdapter {
  public readonly dialect = 'sqlite';
  public db: ISqliteDb;

  constructor(dbOrPath: ISqliteDb | string) {
    if (typeof dbOrPath === 'string') {
      this.db = new DatabaseSync(dbOrPath);
    } else {
      this.db = dbOrPath;
    }
  }

  public async init(): Promise<void> {
    this.db.exec(SQLITE_CORE_DDL);
  }

  public async close(): Promise<void> {
    if (typeof this.db.close === 'function') {
      this.db.close();
    }
  }

  public requests = {
    createRequest: async (data: any): Promise<any> => {
      const stmt = this.db.prepare(`
        INSERT INTO Request (userId, projectId, conversationId, ast, context, priority, toolName, scheduledAt, notifyId, pendingDependencies, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW')
      `);
      const result: any = stmt.run(
        data.userId,
        data.projectId ?? null,
        data.conversationId,
        data.ast ? JSON.stringify(data.ast) : null,
        data.context ? JSON.stringify(data.context) : null,
        data.priority ?? 0,
        data.toolName ?? null,
        data.scheduledAt ? data.scheduledAt.toISOString() : null,
        data.notifyId ?? null,
        data.pendingDependencies ?? 0
      );
      const id = Number(result.lastInsertRowid);
      return this.requests.getRequestById(id);
    },

    getRequestById: async (id: number): Promise<any> => {
      const row: any = this.db.prepare('SELECT * FROM Request WHERE id = ?').get(id);
      if (!row) return null;
      return {
        ...row,
        ast: row.ast ? JSON.parse(row.ast) : null,
        context: row.context ? JSON.parse(row.context) : null,
      };
    },

    pollAndLockRequests: async (workerId: string, limit = 10): Promise<any[]> => {
      const now = new Date().toISOString();
      // Atomic query & lock within SQLite
      const candidates: any[] = this.db.prepare(`
        SELECT * FROM Request
        WHERE status = 'NEW'
          AND pendingDependencies <= 0
          AND (scheduledAt IS NULL OR scheduledAt <= ?)
        ORDER BY priority DESC, createdAt ASC
        LIMIT ?
      `).all(now, limit);

      const locked: any[] = [];
      const updateStmt = this.db.prepare(`
        UPDATE Request
        SET status = 'WAITING', lockedBy = ?, lockedAt = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'NEW'
      `);

      for (const row of candidates) {
        const res: any = updateStmt.run(workerId, row.id);
        if (res.changes > 0) {
          locked.push({
            ...row,
            status: 'WAITING',
            lockedBy: workerId,
            ast: row.ast ? JSON.parse(row.ast) : null,
            context: row.context ? JSON.parse(row.context) : null,
          });
        }
      }

      return locked;
    },

    updateRequest: async (id: number, data: any): Promise<void> => {
      const fields: string[] = [];
      const values: any[] = [];

      if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }
      if (data.lockedBy !== undefined) { fields.push('lockedBy = ?'); values.push(data.lockedBy); }
      if (data.lockedAt !== undefined) { fields.push('lockedAt = ?'); values.push(data.lockedAt ? data.lockedAt.toISOString() : null); }
      if (data.retryCount !== undefined) { fields.push('retryCount = ?'); values.push(data.retryCount); }
      if (data.pendingDependencies !== undefined) { fields.push('pendingDependencies = ?'); values.push(data.pendingDependencies); }
      if (data.context !== undefined) { fields.push('context = ?'); values.push(data.context ? JSON.stringify(data.context) : null); }
      if (data.ast !== undefined) { fields.push('ast = ?'); values.push(data.ast ? JSON.stringify(data.ast) : null); }

      if (fields.length === 0) return;
      fields.push('updatedAt = CURRENT_TIMESTAMP');
      values.push(id);

      this.db.prepare(`UPDATE Request SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    },

    createResponse: async (data: any): Promise<any> => {
      const stmt = this.db.prepare(`
        INSERT INTO Response (requestId, userId, projectId, conversationId, content, state, status)
        VALUES (?, ?, ?, ?, ?, ?, 'COMPLETED')
      `);
      const result: any = stmt.run(
        data.requestId,
        data.userId,
        data.projectId ?? null,
        data.conversationId,
        data.content ?? '',
        data.state ? JSON.stringify(data.state) : null
      );
      const id = Number(result.lastInsertRowid);
      const row: any = this.db.prepare('SELECT * FROM Response WHERE id = ?').get(id);
      return {
        ...row,
        state: row.state ? JSON.parse(row.state) : null,
      };
    },

    pauseRequest: async (id: number): Promise<boolean> => {
      const res: any = this.db.prepare(`
        UPDATE Request
        SET status = 'PAUSED', lockedBy = NULL, lockedAt = NULL
        WHERE id = ? AND status IN ('NEW', 'WAITING', 'RUNNING')
      `).run(id);
      return res.changes > 0;
    },

    resumeRequest: async (id: number): Promise<boolean> => {
      const res: any = this.db.prepare(`
        UPDATE Request
        SET status = 'NEW', lockedBy = NULL, lockedAt = NULL
        WHERE id = ? AND status = 'PAUSED'
      `).run(id);
      return res.changes > 0;
    },

    decrementPendingDependencies: async (parentRequestId: number): Promise<number> => {
      this.db.prepare(`
        UPDATE Request
        SET pendingDependencies = MAX(0, pendingDependencies - 1)
        WHERE id = ?
      `).run(parentRequestId);

      const row: any = this.db.prepare('SELECT pendingDependencies, status FROM Request WHERE id = ?').get(parentRequestId);
      if (row && row.pendingDependencies === 0 && row.status === 'WAITING') {
        this.db.prepare("UPDATE Request SET status = 'NEW' WHERE id = ?").run(parentRequestId);
      }
      return row ? row.pendingDependencies : 0;
    },
  };

  public agents = {
    upsertAgent: async (agentData: any): Promise<any> => {
      const existing: any = this.db.prepare('SELECT * FROM Agent WHERE name = ?').get(agentData.name);
      if (existing) {
        this.db.prepare(`
          UPDATE Agent
          SET description = ?, enabled = ?, schedule = ?, ast = ?, updatedAt = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          agentData.description ?? null,
          agentData.enabled !== false ? 1 : 0,
          agentData.schedule ?? null,
          agentData.ast ? JSON.stringify(agentData.ast) : null,
          existing.id
        );
        return this.agents.getAgentByName(agentData.name);
      } else {
        const stmt = this.db.prepare(`
          INSERT INTO Agent (name, description, userId, projectId, enabled, schedule, ast)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
          agentData.name,
          agentData.description ?? null,
          agentData.userId,
          agentData.projectId ?? null,
          agentData.enabled !== false ? 1 : 0,
          agentData.schedule ?? null,
          agentData.ast ? JSON.stringify(agentData.ast) : null
        );
        return this.agents.getAgentByName(agentData.name);
      }
    },

    getAgentByName: async (name: string): Promise<any> => {
      const row: any = this.db.prepare('SELECT * FROM Agent WHERE name = ?').get(name);
      if (!row) return null;
      return {
        ...row,
        enabled: Boolean(row.enabled),
        ast: row.ast ? JSON.parse(row.ast) : null,
      };
    },

    listScheduledAgents: async (): Promise<any[]> => {
      const rows: any[] = this.db.prepare("SELECT * FROM Agent WHERE schedule IS NOT NULL AND enabled = 1").all();
      return rows.map((r) => ({
        ...r,
        enabled: Boolean(r.enabled),
        ast: r.ast ? JSON.parse(r.ast) : null,
      }));
    },
  };

  public tools = {
    upsertTool: async (toolData: any): Promise<any> => {
      const existing: any = this.db.prepare('SELECT * FROM Tool WHERE name = ?').get(toolData.name);
      if (existing) {
        this.db.prepare(`
          UPDATE Tool
          SET description = ?, parametersSchema = ?, version = ?, updatedAt = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          toolData.description,
          toolData.parametersSchema ? JSON.stringify(toolData.parametersSchema) : null,
          toolData.version ?? '1.0.0',
          existing.id
        );
      } else {
        this.db.prepare(`
          INSERT INTO Tool (name, description, parametersSchema, version)
          VALUES (?, ?, ?, ?)
        `).run(
          toolData.name,
          toolData.description,
          toolData.parametersSchema ? JSON.stringify(toolData.parametersSchema) : null,
          toolData.version ?? '1.0.0'
        );
      }
      return this.db.prepare('SELECT * FROM Tool WHERE name = ?').get(toolData.name);
    },

    listTools: async (): Promise<any[]> => {
      return this.db.prepare('SELECT * FROM Tool').all();
    },
  };
}
