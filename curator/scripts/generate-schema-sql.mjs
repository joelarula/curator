#!/usr/bin/env node
// Writes prisma-<engine>/schema.sql from each Prisma schema (`prisma migrate diff --from-empty`). The Prisma
// schemas are the source of truth; these files are what the provisioners apply (src/db/schemaSql.ts).
// Run after every schema change: npm --prefix curator run prisma:sql
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SCHEMA_FOLDERS = ['prisma-sqlite', 'prisma-mariadb', 'prisma-postgres'];
export const HEADER = '-- Generated from schema.prisma by `npm run prisma:sql` (scripts/generate-schema-sql.mjs). Do not edit.\n';

export function generateSchemaSql(folder) {
  // Fixed arguments (folder names from SCHEMA_FOLDERS), so one command string is safe
  const out = execSync(`npx prisma migrate diff --from-empty --to-schema "${folder}/schema.prisma" --script`, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return HEADER + out.replace(/\r\n/g, '\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  for (const folder of SCHEMA_FOLDERS) {
    const file = path.join(root, folder, 'schema.sql');
    fs.writeFileSync(file, generateSchemaSql(folder));
    console.log(`wrote ${path.relative(root, file)}`);
  }
}
