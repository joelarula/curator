import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const galleryRoot = path.resolve(__dirname, '..');
const deployDir = path.join(galleryRoot, 'deploy');
const zipFile = path.join(galleryRoot, 'gallery-cpanel.zip');

console.log('>>> [1/4] Building web frontend and bundling server...');
execSync('npm run build:cpanel', { cwd: galleryRoot, stdio: 'inherit' });

console.log('>>> [2/4] Preparing deploy directory...');
fs.mkdirSync(deployDir, { recursive: true });
for (const file of fs.readdirSync(deployDir)) {
  fs.rmSync(path.join(deployDir, file), { recursive: true, force: true });
}

// Copy app.js
fs.copyFileSync(path.join(galleryRoot, 'app.js'), path.join(deployDir, 'app.js'));

// Copy web-dist
fs.cpSync(path.join(galleryRoot, 'web-dist'), path.join(deployDir, 'web-dist'), { recursive: true });

// Ensure data/media directory structure exists
fs.mkdirSync(path.join(deployDir, 'data', 'media', 'artmoments', 'photos'), { recursive: true });
fs.mkdirSync(path.join(deployDir, 'data', 'media', 'artmoments', 'thumbnails'), { recursive: true });
fs.mkdirSync(path.join(deployDir, 'data', 'media', 'artmoments', 'originals'), { recursive: true });
fs.mkdirSync(path.join(deployDir, 'data', 'media', 'artmoments', 'assets'), { recursive: true });

const prodPackage = {
  name: 'curator-gallery-app',
  version: '1.0.0',
  type: 'module',
  main: 'app.js',
  scripts: {
    start: 'node app.js',
  },
  dependencies: {
    '@prisma/adapter-mariadb': '^7.6.0',
    '@prisma/client': '^7.6.0',
    'express': '^5.1.0',
    'graphql': '^16.11.0',
    'jsonwebtoken': '^9.0.2',
    'mariadb': '^3.4.0',
    'mysql2': '^3.12.0',
    'passport': '^0.7.0',
    'passport-google-oauth20': '^2.0.0',
    'sharp': '^0.33.5',
  },
};
fs.writeFileSync(path.join(deployDir, 'package.json'), JSON.stringify(prodPackage, null, 2));

const envExample = `# ==============================================================================
# Curator Gallery cPanel / Production Environment Configuration
# Place this file as \`.env\` inside your application root on cPanel
# ==============================================================================

NODE_ENV=production
PORT=4005
GALLERY_PROJECT_ID=artmoments
DATA_DIR=./data

# MariaDB / MySQL Connection (Curator Core Schema)
DATABASE_URL=mysql://DB_USER:DB_PASSWORD@localhost:3306/curator_gallery
CURATOR_DATABASE_URL=mysql://DB_USER:DB_PASSWORD@localhost:3306/curator_gallery

# Google OAuth 2.0 & JWT Authentication
JWT_SECRET=change-me-in-production
GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET
GOOGLE_CALLBACK_URL=https://gallery.example.com/auth/google/callback
FRONTEND_URL=https://gallery.example.com
`;
fs.writeFileSync(path.join(deployDir, '.env.example'), envExample);

console.log('>>> [3/4] Creating zip archive for cPanel upload...');
if (fs.existsSync(zipFile)) {
  fs.unlinkSync(zipFile);
}

try {
  execSync(
    `powershell -Command "Compress-Archive -Path '${deployDir}\\*' -DestinationPath '${zipFile}' -Force"`,
    { stdio: 'inherit' }
  );
  console.log(`>>> [4/4] Done! Upload archive created: ${zipFile}`);
} catch {
  console.log('>>> Archive creation skipped or failed, files available in deploy/');
}
