use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone)]
pub struct SqliteStore {
    conn: Arc<Mutex<Connection>>,
}

#[derive(Debug, Clone)]
pub struct RequestRow {
    pub id: i64,
    pub status: String,
    pub user_id: i64,
    pub conversation_id: String,
    pub ast: Option<String>,
    pub context: Option<String>,
    pub priority: i64,
    pub notify_id: Option<i64>,
    pub pending_dependencies: i64,
    pub retry_count: i64,
    pub scheduled_at: Option<i64>,
}

impl SqliteStore {
    pub fn open(path: &str) -> rusqlite::Result<Self> {
        let conn = Connection::open(path)?;
        let store = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        store.init_schema()?;
        Ok(store)
    }

    pub fn open_in_memory() -> rusqlite::Result<Self> {
        let conn = Connection::open_in_memory()?;
        let store = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        store.init_schema()?;
        Ok(store)
    }

    pub fn init_schema(&self) -> rusqlite::Result<()> {
        let conn = self.conn.lock().expect("sqlite mutex poisoned");
        conn.execute_batch(
            r#"
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                userId INTEGER NOT NULL,
                state TEXT,
                createdAt INTEGER NOT NULL,
                updatedAt INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                status TEXT NOT NULL DEFAULT 'NEW',
                userId INTEGER NOT NULL,
                projectId INTEGER,
                conversationId TEXT NOT NULL,
                ast TEXT,
                context TEXT,
                priority INTEGER NOT NULL DEFAULT 0,
                lockedBy TEXT,
                lockedAt INTEGER,
                scheduledAt INTEGER,
                retryCount INTEGER NOT NULL DEFAULT 0,
                notifyId INTEGER,
                pendingDependencies INTEGER NOT NULL DEFAULT 0,
                createdAt INTEGER NOT NULL,
                updatedAt INTEGER NOT NULL,
                FOREIGN KEY(conversationId) REFERENCES conversations(id)
            );

            CREATE INDEX IF NOT EXISTS idx_requests_status_sched ON requests(status, pendingDependencies, scheduledAt, priority, createdAt);
            CREATE INDEX IF NOT EXISTS idx_requests_notify ON requests(notifyId, status);

            CREATE TABLE IF NOT EXISTS responses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                requestId INTEGER NOT NULL,
                conversationId TEXT NOT NULL,
                userId INTEGER NOT NULL,
                content TEXT NOT NULL,
                createdAt INTEGER NOT NULL,
                FOREIGN KEY(requestId) REFERENCES requests(id) ON DELETE CASCADE,
                FOREIGN KEY(conversationId) REFERENCES conversations(id)
            );

            CREATE INDEX IF NOT EXISTS idx_responses_request ON responses(requestId, createdAt);

            CREATE TABLE IF NOT EXISTS agents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                description TEXT,
                ast TEXT,
                sourceCode TEXT,
                userId INTEGER NOT NULL,
                projectId INTEGER,
                createdAt INTEGER NOT NULL,
                updatedAt INTEGER NOT NULL
            );
            "#,
        )?;
        Ok(())
    }

    pub fn now_ms() -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0)
    }

    pub fn ensure_conversation(&self, conversation_id: &str, user_id: i64) -> rusqlite::Result<()> {
        let now = Self::now_ms();
        let conn = self.conn.lock().expect("sqlite mutex poisoned");
        conn.execute(
            "INSERT OR IGNORE INTO conversations(id, userId, state, createdAt, updatedAt) VALUES(?1, ?2, '{}', ?3, ?3)",
            params![conversation_id, user_id, now],
        )?;
        Ok(())
    }

    pub fn insert_request(
        &self,
        user_id: i64,
        conversation_id: &str,
        status: &str,
        pending_dependencies: i64,
        notify_id: Option<i64>,
        ast: Option<&str>,
        context: Option<&str>,
        priority: i64,
        scheduled_at: Option<i64>,
    ) -> rusqlite::Result<i64> {
        let now = Self::now_ms();
        let conn = self.conn.lock().expect("sqlite mutex poisoned");
        conn.execute(
            r#"INSERT INTO requests(
                status, userId, conversationId, ast, context, priority,
                notifyId, pendingDependencies, scheduledAt, createdAt, updatedAt
            ) VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)"#,
            params![
                status,
                user_id,
                conversation_id,
                ast,
                context,
                priority,
                notify_id,
                pending_dependencies,
                scheduled_at,
                now
            ],
        )?;
        Ok(conn.last_insert_rowid())
    }

    pub fn fetch_request(&self, request_id: i64) -> rusqlite::Result<Option<RequestRow>> {
        let conn = self.conn.lock().expect("sqlite mutex poisoned");
        conn.query_row(
            "SELECT id, status, userId, conversationId, ast, context, priority, notifyId, pendingDependencies, retryCount, scheduledAt FROM requests WHERE id = ?1",
            params![request_id],
            |row| {
                Ok(RequestRow {
                    id: row.get(0)?,
                    status: row.get(1)?,
                    user_id: row.get(2)?,
                    conversation_id: row.get(3)?,
                    ast: row.get(4)?,
                    context: row.get(5)?,
                    priority: row.get(6)?,
                    notify_id: row.get(7)?,
                    pending_dependencies: row.get(8)?,
                    retry_count: row.get(9)?,
                    scheduled_at: row.get(10)?,
                })
            },
        )
        .optional()
    }

    pub fn claim_new_requests(&self, worker_id: &str, limit: i64) -> rusqlite::Result<Vec<i64>> {
        let now = Self::now_ms();
        let conn = self.conn.lock().expect("sqlite mutex poisoned");

        let mut stmt = conn.prepare(
            r#"SELECT id FROM requests
               WHERE status = 'NEW'
                 AND pendingDependencies = 0
                 AND (scheduledAt IS NULL OR scheduledAt <= ?1)
               ORDER BY priority DESC, createdAt ASC
               LIMIT ?2"#,
        )?;

        let ids = stmt
            .query_map(params![now, limit], |row| row.get::<_, i64>(0))?
            .collect::<rusqlite::Result<Vec<i64>>>()?;

        let mut claimed = Vec::new();
        for id in ids {
            let changed = conn.execute(
                "UPDATE requests SET status='WAITING', lockedBy=?1, lockedAt=?2, updatedAt=?2 WHERE id=?3 AND status='NEW' AND pendingDependencies=0",
                params![worker_id, now, id],
            )?;
            if changed > 0 {
                claimed.push(id);
            }
        }

        Ok(claimed)
    }

    pub fn waiting_for_user_with_response(&self, limit: i64) -> rusqlite::Result<Vec<i64>> {
        let conn = self.conn.lock().expect("sqlite mutex poisoned");
        let mut stmt = conn.prepare(
            r#"SELECT r.id
               FROM requests r
               WHERE r.status = 'WAITING_FOR_USER'
               AND EXISTS(SELECT 1 FROM responses x WHERE x.requestId = r.id)
               ORDER BY r.createdAt ASC
               LIMIT ?1"#,
        )?;
        let rows = stmt
            .query_map(params![limit], |row| row.get::<_, i64>(0))?
            .collect::<rusqlite::Result<Vec<i64>>>()?;
        Ok(rows)
    }

    pub fn latest_response_user(&self, request_id: i64) -> rusqlite::Result<Option<i64>> {
        let conn = self.conn.lock().expect("sqlite mutex poisoned");
        conn.query_row(
            "SELECT userId FROM responses WHERE requestId=?1 ORDER BY createdAt DESC LIMIT 1",
            params![request_id],
            |r| r.get::<_, i64>(0),
        )
        .optional()
    }

    pub fn set_request_status_locked(
        &self,
        request_id: i64,
        status: &str,
        worker_id: Option<&str>,
    ) -> rusqlite::Result<()> {
        let now = Self::now_ms();
        let conn = self.conn.lock().expect("sqlite mutex poisoned");
        conn.execute(
            "UPDATE requests SET status=?1, lockedBy=?2, lockedAt=?3, updatedAt=?3 WHERE id=?4",
            params![status, worker_id, now, request_id],
        )?;
        Ok(())
    }

    pub fn create_response(
        &self,
        request_id: i64,
        conversation_id: &str,
        user_id: i64,
        content: &str,
    ) -> rusqlite::Result<()> {
        let now = Self::now_ms();
        let conn = self.conn.lock().expect("sqlite mutex poisoned");
        conn.execute(
            "INSERT INTO responses(requestId, conversationId, userId, content, createdAt) VALUES(?1, ?2, ?3, ?4, ?5)",
            params![request_id, conversation_id, user_id, content, now],
        )?;
        Ok(())
    }

    pub fn last_response_content(&self, request_id: i64) -> rusqlite::Result<Option<String>> {
        let conn = self.conn.lock().expect("sqlite mutex poisoned");
        conn.query_row(
            "SELECT content FROM responses WHERE requestId=?1 ORDER BY createdAt DESC LIMIT 1",
            params![request_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
    }

    /// Returns true if a request has reached a terminal status (COMPLETED, FAILED, SKIPPED).
    pub fn request_is_done(&self, request_id: i64) -> rusqlite::Result<bool> {
        let conn = self.conn.lock().expect("sqlite mutex poisoned");
        let status: Option<String> = conn
            .query_row(
                "SELECT status FROM requests WHERE id=?1",
                params![request_id],
                |row| row.get(0),
            )
            .optional()?;
        Ok(matches!(
            status.as_deref(),
            Some("COMPLETED") | Some("FAILED") | Some("SKIPPED")
        ))
    }

    /// Returns all responses for a conversation, ordered by creation time.
    pub fn conversation_responses(&self, conversation_id: &str) -> rusqlite::Result<Vec<(i64, String)>> {
        let conn = self.conn.lock().expect("sqlite mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT requestId, content FROM responses WHERE conversationId=?1 ORDER BY createdAt ASC",
        )?;
        let rows = stmt
            .query_map(params![conversation_id], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }

    /// Returns the final status of a request.
    pub fn request_status(&self, request_id: i64) -> rusqlite::Result<Option<String>> {
        let conn = self.conn.lock().expect("sqlite mutex poisoned");
        conn.query_row(
            "SELECT status FROM requests WHERE id=?1",
            params![request_id],
            |row| row.get(0),
        )
        .optional()
    }

    /// Returns the number of unfinished requests in a conversation.
    pub fn conversation_pending_request_count(&self, conversation_id: &str) -> rusqlite::Result<i64> {
        let conn = self.conn.lock().expect("sqlite mutex poisoned");
        conn.query_row(
            "SELECT COUNT(*) FROM requests WHERE conversationId=?1 AND status NOT IN ('COMPLETED', 'FAILED', 'SKIPPED')",
            params![conversation_id],
            |row| row.get(0),
        )
    }

    /// Returns the stored conversation state as raw JSON text.
    pub fn get_conversation_state(&self, conversation_id: &str) -> rusqlite::Result<Option<String>> {
        let conn = self.conn.lock().expect("sqlite mutex poisoned");
        conn.query_row(
            "SELECT state FROM conversations WHERE id=?1",
            params![conversation_id],
            |row| row.get(0),
        )
        .optional()
    }

    pub fn decrement_dependency_and_set_context(
        &self,
        request_id: i64,
        merged_input: Option<&str>,
    ) -> rusqlite::Result<()> {
        let now = Self::now_ms();
        let conn = self.conn.lock().expect("sqlite mutex poisoned");
        let current_ctx: Option<String> = conn
            .query_row(
                "SELECT context FROM requests WHERE id=?1",
                params![request_id],
                |r| r.get(0),
            )
            .optional()?
            .flatten();

        let mut ctx = current_ctx
            .and_then(|x| serde_json::from_str::<Value>(&x).ok())
            .unwrap_or_else(|| Value::Object(Default::default()));

        if let Some(input) = merged_input {
            if let Value::Object(map) = &mut ctx {
                map.insert("input".to_string(), Value::String(input.to_string()));
            }
        }

        conn.execute(
            "UPDATE requests SET pendingDependencies = CASE WHEN pendingDependencies > 0 THEN pendingDependencies - 1 ELSE 0 END, context=?1, updatedAt=?2 WHERE id=?3",
            params![serde_json::to_string(&ctx).unwrap_or_else(|_| "{}".to_string()), now, request_id],
        )?;
        Ok(())
    }

    pub fn merge_conversation_state(&self, conversation_id: &str, patch: &Value) -> rusqlite::Result<Value> {
        let now = Self::now_ms();
        let conn = self.conn.lock().expect("sqlite mutex poisoned");
        let current: Option<String> = conn
            .query_row(
                "SELECT state FROM conversations WHERE id=?1",
                params![conversation_id],
                |r| r.get(0),
            )
            .optional()?
            .flatten();

        let mut merged = current
            .and_then(|x| serde_json::from_str::<Value>(&x).ok())
            .unwrap_or_else(|| Value::Object(Default::default()));

        deep_merge(&mut merged, patch);

        conn.execute(
            "UPDATE conversations SET state=?1, updatedAt=?2 WHERE id=?3",
            params![serde_json::to_string(&merged).unwrap_or_else(|_| "{}".to_string()), now, conversation_id],
        )?;

        Ok(merged)
    }

    pub fn find_agent_ast(&self, name: &str) -> rusqlite::Result<Option<String>> {
        let conn = self.conn.lock().expect("sqlite mutex poisoned");
        conn.query_row(
            "SELECT ast FROM agents WHERE name=?1",
            params![name],
            |row| row.get::<_, Option<String>>(0),
        )
        .optional()
        .map(|x| x.flatten())
    }

    pub fn set_request_context_and_new(
        &self,
        request_id: i64,
        pending_dependencies: i64,
        context: &Value,
    ) -> rusqlite::Result<()> {
        let now = Self::now_ms();
        let conn = self.conn.lock().expect("sqlite mutex poisoned");
        conn.execute(
            "UPDATE requests SET pendingDependencies=?1, status='NEW', lockedBy=NULL, lockedAt=NULL, context=?2, updatedAt=?3 WHERE id=?4",
            params![pending_dependencies, serde_json::to_string(context).unwrap_or_else(|_| "{}".to_string()), now, request_id],
        )?;
        Ok(())
    }

    pub fn update_request_notify(&self, request_id: i64, notify_id: Option<i64>) -> rusqlite::Result<()> {
        let now = Self::now_ms();
        let conn = self.conn.lock().expect("sqlite mutex poisoned");
        conn.execute(
            "UPDATE requests SET notifyId=?1, updatedAt=?2 WHERE id=?3",
            params![notify_id, now, request_id],
        )?;
        Ok(())
    }

    pub fn completed_children_with_last_response(&self, notify_id: i64) -> rusqlite::Result<Vec<String>> {
        let conn = self.conn.lock().expect("sqlite mutex poisoned");
        let mut stmt = conn.prepare(
            r#"SELECT COALESCE((
                    SELECT rr.content
                    FROM responses rr
                    WHERE rr.requestId = r.id
                    ORDER BY rr.createdAt DESC
                    LIMIT 1
                ), '') AS content
               FROM requests r
               WHERE r.notifyId = ?1 AND r.status = 'COMPLETED'
               ORDER BY r.createdAt ASC"#,
        )?;
        let rows = stmt
            .query_map(params![notify_id], |row| row.get::<_, String>(0))?
            .collect::<rusqlite::Result<Vec<String>>>()?;
        Ok(rows)
    }

    pub fn update_many_new_to_status_by_priority(
        &self,
        conversation_id: &str,
        below_priority: i64,
        status: &str,
    ) -> rusqlite::Result<usize> {
        let now = Self::now_ms();
        let conn = self.conn.lock().expect("sqlite mutex poisoned");
        let affected = conn.execute(
            "UPDATE requests SET status=?1, updatedAt=?2 WHERE conversationId=?3 AND status='NEW' AND priority < ?4",
            params![status, now, conversation_id, below_priority],
        )?;
        Ok(affected)
    }

    pub fn update_many_status(
        &self,
        conversation_id: &str,
        from_status: &str,
        to_status: &str,
    ) -> rusqlite::Result<usize> {
        let now = Self::now_ms();
        let conn = self.conn.lock().expect("sqlite mutex poisoned");
        let affected = conn.execute(
            "UPDATE requests SET status=?1, lockedBy=NULL, lockedAt=NULL, updatedAt=?2 WHERE conversationId=?3 AND status=?4",
            params![to_status, now, conversation_id, from_status],
        )?;
        Ok(affected)
    }

    pub fn set_retry_new_scheduled(&self, request_id: i64, retry_count: i64, scheduled_at: i64) -> rusqlite::Result<()> {
        let now = Self::now_ms();
        let conn = self.conn.lock().expect("sqlite mutex poisoned");
        conn.execute(
            "UPDATE requests SET status='NEW', lockedBy=NULL, lockedAt=NULL, retryCount=?1, scheduledAt=?2, updatedAt=?3 WHERE id=?4",
            params![retry_count, scheduled_at, now, request_id],
        )?;
        Ok(())
    }
}

fn deep_merge(target: &mut Value, patch: &Value) {
    match (target, patch) {
        (Value::Object(t), Value::Object(p)) => {
            for (k, v) in p {
                match t.get_mut(k) {
                    Some(existing) => deep_merge(existing, v),
                    None => {
                        t.insert(k.clone(), v.clone());
                    }
                }
            }
        }
        (t, p) => {
            *t = p.clone();
        }
    }
}
