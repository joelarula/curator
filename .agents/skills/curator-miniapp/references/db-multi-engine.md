# Multi-Engine Database Architecture (SQLite, PostgreSQL, MariaDB/MySQL)

Curator MiniApps support dynamic database engines through standard env configuration (`DATABASE_URL`, `DATABASE_PATH`, `DATABASE_TYPE`).

## 1. Multi-Engine Abstraction Strategy

To maintain high performance and low operational complexity, MiniApps support:
- **SQLite**: Zero-dependency local file database via `node:sqlite` (Node.js 22.5+) for local development, desktop deployments, and isolated testing.
- **PostgreSQL**: Production-grade database using `pg.Pool` or `@prisma/adapter-pg` with `pg_trgm` fuzzy search support.
- **MariaDB / MySQL**: Production-grade database using Prisma client or `mysql2` pool.

---

## 2. Dynamic DB Connection Helper (`src/db.js`)

Below is the standard dynamic database wrapper for MiniApps:

```javascript
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';

/**
 * Converts standard SQL parameters (?) to Postgres-style parameters ($1, $2)
 */
export function convertSqlToPg(sql) {
  let paramIndex = 1;
  return sql
    .replace(/\?/g, () => `$${paramIndex++}`)
    .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY')
    .replace(/sqlite_master/gi, 'information_schema.tables');
}

/**
 * Ensures schema creation for PostgreSQL target
 */
export async function ensurePostgresSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS miniapp_entities (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);
}

/**
 * Ensures schema creation for SQLite target
 */
export function ensureSqliteSchema(db) {
  const hasTable = db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='miniapp_entities'").get();
  if (hasTable && hasTable.count > 0) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS miniapp_entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL
    );
  `);
}

/**
 * Opens a database connection (PostgreSQL pool or SQLite file DB) with unified interface (.prepare, .exec, .close)
 */
export function openDatabase(customPath) {
  const dbUrl = process.env.DATABASE_URL;

  if (dbUrl && (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://'))) {
    console.log(`[DB] Connecting to PostgreSQL at ${dbUrl.split('@')[1] || dbUrl}`);
    const pool = new pg.Pool({ connectionString: dbUrl });

    // Polyfill synchronous-like or async-aware prep statements for PG
    return {
      isPostgres: true,
      pool,
      prepare(sql) {
        const pgSql = convertSqlToPg(sql);
        return {
          all(...params) {
            const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
            return pool.query(pgSql, flat).then(res => res.rows);
          },
          get(...params) {
            const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
            return pool.query(pgSql, flat).then(res => res.rows[0] ?? null);
          },
          run(...params) {
            const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
            return pool.query(pgSql, flat).then(res => ({
              changes: res.rowCount,
              lastInsertRowid: res.rows[0]?.id ?? null,
            }));
          }
        };
      },
      exec(sql) {
        return pool.query(sql);
      },
      close() {
        return pool.end();
      }
    };
  }

  // Fallback to local SQLite DB
  const path = customPath ?? process.env.DATABASE_PATH ?? 'data/app.db';
  mkdirSync(dirname(path), { recursive: true });
  console.log(`[DB] Opening SQLite database at ${path}`);
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  ensureSqliteSchema(db);

  return {
    isPostgres: false,
    sqlite: db,
    prepare(sql) {
      const stmt = db.prepare(sql);
      return {
        all(...params) {
          const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          return stmt.all(...flat);
        },
        get(...params) {
          const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          return stmt.get(...flat);
        },
        run(...params) {
          const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          return stmt.run(...flat);
        }
      };
    },
    exec(sql) {
      return db.exec(sql);
    },
    close() {
      return db.close();
    }
  };
}
```

---

## 3. Prisma Multi-Provider Schema (`prisma/schema.prisma`)

```prisma
datasource db {
  provider = "postgresql" // or "sqlite" / "mysql"
}

generator client {
  provider = "prisma-client-js"
}

model Entity {
  id        Int      @id @default(autoincrement())
  title     String
  status    String   @default("active")
  createdAt DateTime @default(now()) @map("created_at")

  @@map("miniapp_entities")
}
```

To switch database drivers dynamically with Prisma:
- **PostgreSQL**: `@prisma/adapter-pg`
- **MariaDB / MySQL**: `@prisma/adapter-mariadb` or `mysql2`
- **SQLite**: Standard `@prisma/client` or `@prisma/adapter-libsql`
