import { existsSync, mkdirSync, cpSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = dirname(__dirname);
const outDir = join(rootDir, 'dist-readonly');

console.log('[Package ReadOnly] Packaging standalone read-only deployable...');

if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
}

// 1. Copy app-readonly.js -> dist-readonly/app.js
const appSource = join(rootDir, 'app-readonly.js');
if (!existsSync(appSource)) {
  console.error('[Package ReadOnly] Error: app-readonly.js not found! Run `npm run build:server:readonly` first.');
  process.exit(1);
}
cpSync(appSource, join(outDir, 'app.js'));
console.log(' -> Copied app-readonly.js to dist-readonly/app.js');

// 2. Copy web-dist -> dist-readonly/web-dist
const webDistSource = existsSync(join(rootDir, 'web-dist', 'server'))
  ? join(rootDir, 'web-dist', 'server')
  : join(rootDir, 'web-dist');

if (existsSync(webDistSource)) {
  cpSync(webDistSource, join(outDir, 'web-dist'), { recursive: true });
  console.log(' -> Copied web-dist to dist-readonly/web-dist');
} else {
  console.warn(' -> Warning: web-dist not found. Make sure to run `npm run build:web:server` before deployment.');
}

// 3. Create minimal package.json
const minimalPkg = {
  name: 'keeris-readonly-app',
  version: '1.0.0',
  private: true,
  type: 'module',
  main: 'app.js',
  scripts: {
    start: 'node app.js'
  },
  dependencies: {
    express: '^5.1.0',
    graphql: '^16.11.0',
    mysql2: '^3.12.0',
    mariadb: '^3.5.4'
  }
};
writeFileSync(join(outDir, 'package.json'), JSON.stringify(minimalPkg, null, 2));
console.log(' -> Generated minimal package.json');

// 4. Create .env.example
const envExample = `# Keeris Read-Only Deployment Configuration
PORT=4001

# MySQL / MariaDB connection to pre-prepared database
DATABASE_URL=mysql://curator:curator_secret@localhost:3306/keeris

# (Optional) or SQLite database path
# DATABASE_URL=data/keeris.db
`;
writeFileSync(join(outDir, '.env.example'), envExample);
console.log(' -> Generated .env.example');

// 5. Create README.md
const readme = `# Keeris Read-Only Application

Lightweight, high-performance web explorer for ERR radio airings and music archives.

## Requirements
- Node.js >= 20
- MySQL or MariaDB pre-populated with the Keeris database schema (or SQLite file)

## Quick Start
1. Install minimal dependencies:
   \`\`\`bash
   npm install
   \`\`\`
2. Configure \`.env\`:
   \`\`\`bash
   cp .env.example .env
   # Edit DATABASE_URL with your database credentials
   \`\`\`
3. Run the application:
   \`\`\`bash
   npm start
   \`\`\`
   Open http://localhost:4001 in your browser.
`;
writeFileSync(join(outDir, 'README.md'), readme);
console.log(' -> Generated README.md');

console.log(`\n[Package ReadOnly] Complete! Standalone bundle ready in: ${outDir}\n`);
