#!/usr/bin/env node
// Thin wrapper so `npm link` exposes a real executable on Windows.
// Delegates to tsx, which handles TypeScript on-the-fly.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const script = path.resolve(__dirname, '../src/bin/curator.ts');

const child = spawn(
  process.execPath,           // node
  [
    '--import', 'tsx/esm',   // register tsx ESM loader
    script,
    ...process.argv.slice(2) // forward all CLI args
  ],
  { stdio: 'inherit' }
);

child.on('exit', (code) => process.exit(code ?? 0));
