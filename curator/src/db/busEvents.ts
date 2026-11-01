import type { SchemaDb } from './schemaSql.js';

/**
 * One-time upgrade for databases from before `BusEvent` (docs/DISTRIBUTED_STORAGE_PLAN.md, Phase 3): dispatched
 * events used to share `EventLog` (and its ids) with the `__state.*` events. Runs only while `BusEvent` has never
 * issued an id and `EventLog` has rows:
 *  - copies the non-state events into `BusEvent` with their ids and removes them from `EventLog`;
 *  - starts `BusEvent` ids above every `EventLog` id, so request cursors (`Request.eventCursor`, which may hold a
 *    state event's id) and saved history cursors stay below every new event.
 * Afterwards `BusEvent` has issued ids and this does nothing. Call it after convergeSchema / convergePartitions.
 */
const STATE_EVENTS = `('__state.patch', '__state.rewind')`;
const COLUMNS = ['id', 'conversationId', 'eventName', 'payload', 'target', 'source', 'createdAt'];

export async function migrateBusEvents(db: SchemaDb): Promise<{ copied: number; startsAt: number } | null> {
  const q = (name: string) => (db.dialect === 'mysql' ? `\`${name}\`` : `"${name}"`);
  const num = (rows: any[], key: string) => (rows[0]?.[key] == null ? null : Number(rows[0][key]));
  if (!(await neverIssued(db, q))) return null;
  const maxLog = num(await db.query(`SELECT MAX(${q('id')}) AS m FROM ${q('EventLog')}`), 'm');
  if (maxLog == null) return null;

  const columns = COLUMNS.map(q).join(', ');
  const notState = `${q('eventName')} NOT IN ${STATE_EVENTS}`;
  const copied = num(await db.query(`SELECT COUNT(*) AS n FROM ${q('EventLog')} WHERE ${notState}`), 'n') ?? 0;
  if (copied > 0) {
    await db.exec(`INSERT INTO ${q('BusEvent')} (${columns}) SELECT ${columns} FROM ${q('EventLog')} WHERE ${notState}`);
    await db.exec(`DELETE FROM ${q('EventLog')} WHERE ${notState}`);
  }
  const next = maxLog + 1;
  if (db.dialect === 'postgresql') {
    await db.query(`SELECT setval(pg_get_serial_sequence('"BusEvent"', 'id'), ${maxLog})`);
  } else if (db.dialect === 'mysql') {
    await db.exec(`ALTER TABLE \`BusEvent\` AUTO_INCREMENT = ${next}`);
  } else {
    await db.exec(`DELETE FROM sqlite_sequence WHERE name = 'BusEvent'`);
    await db.exec(`INSERT INTO sqlite_sequence (name, seq) VALUES ('BusEvent', ${maxLog})`);
  }
  return { copied, startsAt: next };
}

/** True while BusEvent has never handed out an id (a new table). */
async function neverIssued(db: SchemaDb, q: (name: string) => string): Promise<boolean> {
  const rows = await db.query(`SELECT COUNT(*) AS n FROM ${q('BusEvent')}`);
  if (Number(rows[0]?.n) > 0) return false;
  if (db.dialect === 'postgresql') {
    const seq = (await db.query(`SELECT pg_get_serial_sequence('"BusEvent"', 'id') AS s`))[0]?.s;
    if (!seq) return false;
    return !(await db.query(`SELECT is_called FROM ${seq}`))[0]?.is_called;
  }
  if (db.dialect === 'mysql') {
    const auto = await db.query(
      `SELECT AUTO_INCREMENT AS a FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'BusEvent'`
    );
    return auto[0]?.a == null || Number(auto[0].a) <= 1;
  }
  return (await db.query(`SELECT COUNT(*) AS n FROM sqlite_sequence WHERE name = 'BusEvent'`).catch(() => [{ n: 0 }]))[0]?.n == 0;
}

export function reportBusEvents(source: string, result: { copied: number; startsAt: number } | null): void {
  if (result) console.log(`[${source}] BusEvent: moved ${result.copied} dispatched event(s) out of EventLog; new ids start at ${result.startsAt}`);
}
