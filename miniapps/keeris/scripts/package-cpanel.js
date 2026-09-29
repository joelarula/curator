import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const keerisRoot = path.resolve(__dirname, '..');
const deployDir = path.join(keerisRoot, 'deploy');
const zipFile = path.join(keerisRoot, 'keeris-cpanel.zip');

console.log('>>> [1/4] Building web frontend and bundling server...');
execSync('npm run build:cpanel', { cwd: keerisRoot, stdio: 'inherit' });

console.log('>>> [2/4] Preparing deploy directory...');
fs.mkdirSync(deployDir, { recursive: true });
for (const file of fs.readdirSync(deployDir)) {
  fs.rmSync(path.join(deployDir, file), { recursive: true, force: true });
}

// Copy app.js
fs.copyFileSync(path.join(keerisRoot, 'app.js'), path.join(deployDir, 'app.js'));

// Copy web-dist
fs.cpSync(path.join(keerisRoot, 'web-dist'), path.join(deployDir, 'web-dist'), { recursive: true });

// Only create an empty data directory if needed for runtime downloads
// (Do not copy heavy local sqlite databases)
fs.mkdirSync(path.join(deployDir, 'data'), { recursive: true });

// Generate clean production package.json
const prodPackage = {
  name: 'keeris-app',
  version: '1.0.0',
  type: 'module',
  main: 'app.js',
  scripts: {
    start: 'node app.js'
  },
  dependencies: {
    '@prisma/adapter-mariadb': '^7.10.0',
    '@prisma/client': '^7.6.0',
    'cheerio': '^1.1.2',
    'express': '^5.1.0',
    'graphql': '^16.11.0',
    'jsonwebtoken': '^9.0.2',
    'mariadb': '^3.5.4',
    'mysql2': '^3.12.0',
    'passport': '^0.7.0',
    'passport-google-oauth20': '^2.0.0'
  }
};
fs.writeFileSync(path.join(deployDir, 'package.json'), JSON.stringify(prodPackage, null, 2));

// Create .env.example
const envExample = `# ==============================================================================
# Keeris cPanel / Localhost Production Environment Configuration
# Place this file as \`.env\` inside your application root on cPanel:
# /home/<cpanel_user>/keeris/.env
# ==============================================================================

NODE_ENV=production
PORT=4001

# ------------------------------------------------------------------------------
# 1. Main Keeris Database (MariaDB / MySQL on localhost)
# Host is localhost (or 127.0.0.1) when running on cPanel server
# Database: sepisedc_curator_keeris
# Replace YOUR_DB_USER and YOUR_DB_PASSWORD with your credentials
# ------------------------------------------------------------------------------
DATABASE_URL=mysql://sepisedc_curator:YOUR_DB_PASSWORD@localhost:3306/sepisedc_curator_keeris

# ------------------------------------------------------------------------------
# 2. Curator Runtime & Engine Configuration
# ------------------------------------------------------------------------------
CURATOR_DATABASE_NAME=keeris
CURATOR_DATABASE_URL=mysql://sepisedc_curator:YOUR_DB_PASSWORD@localhost:3306/sepisedc_curator_keeris

# ------------------------------------------------------------------------------
# 3. Background Scraper / Indexer Interval (in milliseconds)
# 3600000 ms = 1 hour (recommended for shared hosting)
# ------------------------------------------------------------------------------
INDEX_INTERVAL_MS=3600000

# ------------------------------------------------------------------------------
# 4. Google OAuth 2.0 & JWT Authentication (Production https://keeris.arula.dev/)
# ------------------------------------------------------------------------------
JWT_SECRET=your-super-secret-jwt-key
GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET
GOOGLE_API_KEY=YOUR_GOOGLE_API_KEY
GOOGLE_CALLBACK_URL=https://keeris.arula.dev/auth/google/callback
FRONTEND_URL=https://keeris.arula.dev
`;
fs.writeFileSync(path.join(deployDir, '.env.example'), envExample);

console.log('>>> [3/4] Creating zip archive for 1-click cPanel upload...');
if (fs.existsSync(zipFile)) {
  fs.unlinkSync(zipFile);
}

try {
  execSync(`powershell -Command "Compress-Archive -Path '${deployDir}\\*' -DestinationPath '${zipFile}' -Force"`, { stdio: 'inherit' });
  console.log(`>>> [4/4] Done! Upload archive created: ${zipFile}`);
} catch (err) {
  console.log('>>> Archive creation skipped or failed, files available in deploy/');
}
