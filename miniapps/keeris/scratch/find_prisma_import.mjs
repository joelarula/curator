import fs from 'node:fs';

const code = fs.readFileSync('app.js', 'utf8');
const lines = code.split('\n');
let count = 0;
lines.forEach((l, idx) => {
  if (l.includes('@prisma/client') && (l.startsWith('import ') || l.startsWith('export '))) {
    console.log(`Line ${idx + 1}: ${l}`);
    count++;
  }
});
if (count === 0) {
  console.log('✓ SUCCESS: ZERO static imports of @prisma/client exist in app.js!');
}
