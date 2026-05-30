import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
    const dbPath = path.resolve('data', 'mydb.db');
    if (!fs.existsSync(dbPath)) {
        console.error('Database mydb.db not found!');
        return;
    }

    const db = new Database(dbPath);
    const rows = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';").all();
    const ddl = rows.map((r: any) => r.sql + ';').join('\n\n');
    
    const targetDir = path.resolve('..', 'chrome-extension', 'src', 'adapter');
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }
    
    fs.writeFileSync(path.join(targetDir, 'schema.sql'), ddl);
    console.log('Successfully dumped SQLite DDL schema to chrome-extension/src/adapter/schema.sql');
    db.close();
}

main();
