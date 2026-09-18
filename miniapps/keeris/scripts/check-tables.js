import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('data/keeris-archive-full.db');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
console.log('Tables in keeris-archive-full.db:', tables);
