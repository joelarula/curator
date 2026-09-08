# Rule: No Background Task Polling Loops

## What is forbidden

Do NOT repeatedly call `manage_task status` in a loop to wait for a background task to complete.

This is wasteful because:
- Each status call returns the full task log, bloating the conversation context
- Every subsequent LLM call processes the entire growing context
- Token usage grows quadratically and can cause API overload errors

## What to do instead

After launching a background task with `run_command` (IsDaemon=false):
1. **Stop calling tools** — the system will automatically notify you when the task finishes
2. If the user wants to monitor progress, **provide a terminal command or script** they can run themselves (see below)
3. If a brief startup check is needed (e.g. to catch immediate failures), use `WaitMsBeforeAsync` on the initial `run_command` call — do NOT poll afterward

## Providing progress monitoring to the user

When starting a long-running background task, always offer the user a ready-to-run command to watch progress. Examples:

**Follow a log file (Linux/SSH):**
```bash
tail -f /path/to/logfile.log
```

**Watch a Node.js script's output in the terminal:**
```bash
node scripts/my-script.js 2>&1 | tee /tmp/progress.log
```

**Check DB row count while scraping (PostgreSQL):**
```sql
-- run in psql to watch rows accumulate
SELECT COUNT(*) FROM episodes WHERE program_id = 'soovide_aeg';
```

**Check DB row count (Node one-liner):**
```bash
node -e "
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
db.query('SELECT COUNT(*) FROM episodes').then(r => { console.log(r.rows[0]); db.end(); });
"
```

Give the user at least one of these when launching any long-running task so they can observe it themselves without needing to ask the agent.

## When polling IS allowed

Only call `manage_task status` again if:
- The user **explicitly asks** to check on a task ("how is it going?", "is it done?")
- You need to check a single time before taking a dependent action

## Summary

**Never poll in a loop. Fire, provide a monitoring command to the user, then stop.**
