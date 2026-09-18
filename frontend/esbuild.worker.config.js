import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { getWasmCoreEsbuildAliases } from '../server/src/wasm-core/shims/esbuild-aliases.js';

const outDir = path.resolve('dist/static');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// 1. Copy sql-wasm.wasm
try {
  let sqlJsWasmPath = path.resolve('node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
  if (!fs.existsSync(sqlJsWasmPath)) {
    sqlJsWasmPath = path.resolve('..', 'chrome-extension', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
  }
  if (fs.existsSync(sqlJsWasmPath)) {
    fs.copyFileSync(sqlJsWasmPath, path.join(outDir, 'sql-wasm.wasm'));
    console.log('[esbuild:worker] Copied sql-wasm.wasm to dist/static/');
  }
} catch (err) {
  console.error('[esbuild:worker] Failed to copy sql-wasm.wasm:', err);
}

// 2. Copy query_compiler_fast_bg.wasm
try {
  const prismaWasmPath = path.resolve('..', 'server', 'src', 'generated', 'prisma-sqlite', 'query_compiler_fast_bg.wasm');
  if (fs.existsSync(prismaWasmPath)) {
    fs.copyFileSync(prismaWasmPath, path.join(outDir, 'query_compiler_fast_bg.wasm'));
    console.log('[esbuild:worker] Copied query_compiler_fast_bg.wasm to dist/static/');
  }
} catch (err) {
  console.error('[esbuild:worker] Failed to copy query_compiler_fast_bg.wasm:', err);
}

// 3. Bundle Web Worker
await esbuild.build({
  entryPoints: ['src/worker/curatorWorker.ts'],
  bundle: true,
  outfile: path.join(outDir, 'curator-worker.js'),
  format: 'esm',
  target: 'es2020',
  alias: getWasmCoreEsbuildAliases(),
  external: ['playwright', 'playwright-core'],
  define: {
    'global': 'globalThis',
    'process.env.NODE_ENV': '"production"'
  },
  banner: {
    js: 'globalThis.process = globalThis.process || { env: { NODE_ENV: "production" }, cwd: () => "/" }; var process = globalThis.process;'
  },
  minify: true,
  sourcemap: true,
});

console.log('[esbuild:worker] Web worker built successfully into dist/static/curator-worker.js');
