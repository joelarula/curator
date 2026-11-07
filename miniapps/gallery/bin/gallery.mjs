#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(__dirname, '../src/cli.ts');

const child = spawn(process.execPath, ['--import', 'tsx', cliPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: resolve(__dirname, '..'),
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});

