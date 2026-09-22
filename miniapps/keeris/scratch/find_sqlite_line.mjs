import fs from 'node:fs';

const code = fs.readFileSync('app.js', 'utf8');
const lines = code.split('\n');

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('@prisma/adapter-better-sqlite3')) {
    console.log(`Line ${i + 1}: ${lines[i]}`);
    console.log('Context:');
    console.log(lines.slice(Math.max(0, i - 5), Math.min(lines.length, i + 6)).join('\n'));
  }
}
