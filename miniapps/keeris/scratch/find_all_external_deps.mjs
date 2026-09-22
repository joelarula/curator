import fs from 'node:fs';
import module from 'node:module';

const code = fs.readFileSync('app.js', 'utf8');
const lines = code.split('\n');
const externalPkgs = new Set();

for (const line of lines) {
  const m = line.match(/(?:from|import)\s+['"]([^'"]+)['"]/);
  if (m) {
    const pkg = m[1];
    if (!pkg.startsWith('node:') && !module.builtinModules.includes(pkg) && !module.builtinModules.includes(pkg.replace(/^node:/, ''))) {
      externalPkgs.add(pkg);
    }
  }
  const req = line.match(/require\(['"]([^'"]+)['"]\)/);
  if (req) {
    const pkg = req[1];
    if (!pkg.startsWith('node:') && !module.builtinModules.includes(pkg) && !module.builtinModules.includes(pkg.replace(/^node:/, ''))) {
      externalPkgs.add(pkg);
    }
  }
}

console.log('--- ALL EXTERNAL PACKAGES IMPORTED BY app.js ---');
console.log(JSON.stringify([...externalPkgs], null, 2));
