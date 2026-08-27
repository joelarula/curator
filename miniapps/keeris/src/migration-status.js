import { existsSync, readFileSync } from 'node:fs';

const path = process.env.MIGRATION_PROGRESS_PATH ?? 'data/migration-progress.json';
if (!existsSync(path)) {
  console.log(JSON.stringify({ phase: 'not-started', path }, null, 2));
  process.exit(0);
}
console.log(readFileSync(path, 'utf8'));