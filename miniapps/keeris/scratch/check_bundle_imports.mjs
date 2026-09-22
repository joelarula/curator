import fs from 'node:fs';

const code = fs.readFileSync('dist/test_bundle.mjs', 'utf8');
const lines = code.split('\n');
const ext = new Set();
for (const line of lines) {
  const m = line.match(/(?:from|import)\s+['"]([^'"]+)['"]/);
  if (m) ext.add(m[1]);
  const req = line.match(/require\(['"]([^'"]+)['"]\)/);
  if (req) ext.add(req[1]);
}
console.log('Externals in test_bundle.mjs:', [...ext]);
