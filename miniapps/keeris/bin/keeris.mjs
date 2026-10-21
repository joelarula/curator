#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliTs = path.resolve(__dirname, '../src/cli.ts');

const child = spawn(process.execPath, [cliTs, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: path.resolve(__dirname, '..'),
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
