import { openDatabase } from '../src/db.ts';

const db = openDatabase('data/keeris.db');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables in data/keeris.db:');
for (const t of tables) {
  try {
    const c = db.prepare(`SELECT count(*) as c FROM "${t.name}"`).get();
    console.log(`- ${t.name}: ${c.c} rows`);
  } catch (e) {
    console.log(`- ${t.name}: error (${e.message})`);
  }
}
db.close();
