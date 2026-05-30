import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const isWatch = process.argv.includes('--watch');

// Ensure dist/ directory exists
if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist', { recursive: true });
}

// Copy sql-wasm.wasm from node_modules to dist/
try {
  const sqlJsWasmPath = path.resolve('node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
  if (fs.existsSync(sqlJsWasmPath)) {
    fs.copyFileSync(sqlJsWasmPath, path.join('dist', 'sql-wasm.wasm'));
    console.log('[esbuild] Copied sql-wasm.wasm to dist/');
  }
} catch (err) {
  console.error('[esbuild] Failed to copy sql-wasm.wasm:', err);
}

// Copy query_compiler_fast_bg.wasm from server to dist/
try {
  const prismaWasmPath = path.resolve('..', 'server', 'src', 'generated', 'prisma-sqlite', 'query_compiler_fast_bg.wasm');
  if (fs.existsSync(prismaWasmPath)) {
    fs.copyFileSync(prismaWasmPath, path.join('dist', 'query_compiler_fast_bg.wasm'));
    console.log('[esbuild] Copied query_compiler_fast_bg.wasm to dist/');
  }
} catch (err) {
  console.error('[esbuild] Failed to copy query_compiler_fast_bg.wasm:', err);
}

const ctx = await esbuild.context({
  entryPoints: ['src/background.ts'],
  bundle: true,
  outfile: 'dist/background.js',
  format: 'esm',
  target: 'es2020',
  alias: {
    'node:vm': './src/shims/vm.ts',
    'vm': './src/shims/vm.ts',
    'fs': './src/shims/fs.ts',
    'fs/promises': './src/shims/fs.ts',
    'playwright': './src/shims/playwright.ts',
    'path': 'path-browserify',
    'os': './src/shims/node-shims.ts',
    'crypto': './src/shims/node-shims.ts',
    'http': './src/shims/node-shims.ts',
    'https': './src/shims/node-shims.ts',
    'url': './src/shims/node-shims.ts',
    'node:url': './src/shims/node-shims.ts',
    'timers': './src/shims/node-shims.ts',
    'child_process': './src/shims/node-shims.ts',
    'node:child_process': './src/shims/node-shims.ts',
    'net': './src/shims/node-shims.ts',
    'tls': './src/shims/node-shims.ts',
    'dotenv': './src/shims/node-shims.ts',
    'stream': './src/shims/node-shims.ts',
    'string_decoder': './src/shims/node-shims.ts',
    // Mock the generated WASM compiler loader directly
    '#wasm-compiler-loader': './src/shims/prisma-wasm-loader.ts'
  },
  define: {
    'global': 'globalThis',
    'process.env.NODE_ENV': '"production"'
  },
  banner: {
    js: 'globalThis.process = globalThis.process || { env: { NODE_ENV: "production" }, cwd: () => "/" }; var process = globalThis.process;'
  },
  minify: !isWatch,
  sourcemap: true,
});

if (isWatch) {
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await ctx.rebuild();
  await ctx.dispose();
  console.log('Build completed successfully!');
}
