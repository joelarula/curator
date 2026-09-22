---
name: cpanel-node-deploy
description: >-
  Prepare, bundle, configure, and deploy Node.js Express/Fastify/GraphQL applications and Vue/React SPAs
  to cPanel shared hosting environments (CloudLinux LVE, Phusion Passenger, LiteSpeed lsnode, MariaDB/MySQL).
---

# cPanel Node.js Deployment Skill

Comprehensive guide, architectural patterns, and automation scripts for deploying production Node.js applications (Express, GraphQL, Vue/React SPAs) to cPanel shared hosting environments running **CloudLinux LVE**, **Phusion Passenger**, or **LiteSpeed (`lsnode.js`)** with **MariaDB / MySQL**.

---

## 1. Core Architecture & Runtime Mechanics

### 1.1 How cPanel Runs Node.js Applications
cPanel hosting (e.g. Virtuaal, Namecheap, Hostinger) does **not** run apps via `npm start` or Docker containers. Instead, the web server (Apache or LiteSpeed) delegates requests via **Phusion Passenger** or LiteSpeed Node Engine (`/usr/local/lsws/fcgi-bin/lsnode.js`).

- **Entry Point Execution**: The engine executes:
  ```bash
  node <Application startup file>
  ```
- **Port Binding**: The engine automatically assigns an internal Unix domain socket or a private port, injected into `process.env.PORT`. The application **must** listen on:
  ```javascript
  const port = process.env.PORT || 4001;
  app.listen(port);
  ```
  *(Never use `Number(process.env.PORT)` because Unix domain socket paths are strings!).*
- **Reverse Proxy**: Visitors access `https://yourdomain.com` (standard port 443/80). Apache/LiteSpeed proxies traffic to the internal Node process automatically. Visitors never see or use port 4001.

---

## 2. The Golden Rule: Build Locally, Deploy Standalone Bundle

> [!IMPORTANT]
> **Always build the frontend and bundle the server LOCALLY before uploading to cPanel.**

### Why You Should Never Build on cPanel:
1. **CloudLinux Memory Limits (OOM Killer)**: Shared hosting accounts enforce strict LVE RAM limits (512MB–1GB). Running Vite, Vuetify, or Webpack builds on cPanel will get killed by the OS kernel (`Out of Memory`).
2. **Monorepo / Relative Dependencies**: Monorepos (`file:../../packages`) fail on remote servers because sibling folders do not exist.
3. **Heavy DevDependencies**: Tools like TypeScript, Vite, ESLint, Vuetify loaders, and Prisma CLI add ~300MB of unnecessary files.
4. **Fast Deployments**: Uploading a single ~4MB pre-built ZIP takes seconds vs hours of slow FTP file transfers.

---

## 3. Critical cPanel Gotchas & Solutions

### 3.1 LiteSpeed `lsnode.js` & Top-Level Await (`ERR_REQUIRE_ASYNC_MODULE`)

**The Symptom:**
```text
Error [ERR_REQUIRE_ASYNC_MODULE]: require() cannot be used on an ESM graph with top-level await.
Required module: /home/user/app.js
Require stack:
- /usr/local/lsws/fcgi-bin/lsnode.js
```

**The Cause:**
LiteSpeed loads the application startup file via CommonJS: `require('/path/to/app.js')`. In Node 22+, `require()` can synchronously load ES modules **only if there are NO top-level `await` statements** in the entire module graph.

**The Fix:**
Remove all top-level `await` keywords from the server entry point. Start Express and listen immediately, and initialize asynchronous services (databases, plugins, queues) in the background:

```javascript
// ❌ WRONG (Crashes LiteSpeed)
const db = await openDatabase();
const plugins = await registerPlugins();
app.listen(port);

// ✅ CORRECT (LiteSpeed / Passenger Compatible)
const db = openDatabase();
registerPlugins().catch(err => console.error('Plugin init error:', err));
const server = app.listen(port, () => console.log(`Server listening on ${port}`));

export default app;
export { app, server };
```

---

### 3.2 Dynamic `require("child_process")` in Bundled ESM

**The Symptom:**
```text
Error: Dynamic require of "child_process" is not supported
    at node_modules/google-auth-library/build/src/auth/googleauth.js
```

**The Cause:**
When `esbuild` bundles CommonJS libraries (e.g. `google-auth-library`, `ws`, `@google/genai`) into an ES Module (`--format=esm`), any CommonJS calls to `require("child_process")` or `require("fs")` hit an esbuild stub that throws because `require` does not exist in standard ESM scope.

**The Fix:**
Inject Node's native `createRequire` banner during bundling:
```bash
--banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);"
```

---

### 3.3 Root Path Resolution & `Cannot GET /`

**The Symptom:**
The Express server starts, but opening `https://domain.com` displays `Cannot GET /`.

**The Cause:**
In development, `src/server/index.ts` is nested inside subfolders (e.g. `src/server/`), so developers use `dirname(dirname(dirname(import.meta.url)))` to locate `web-dist`. When bundled into `app.js` at `/home/user/domain.com/app.js`, going 3 levels up resolves to `/home/`! Express cannot find `web-dist`, skips mounting the static middleware, and returns `Cannot GET /`.

**The Fix:**
Dynamically check if `web-dist` exists right next to `app.js`:
```javascript
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const currentDir = dirname(fileURLToPath(import.meta.url));
const root = existsSync(join(currentDir, 'web-dist'))
  ? currentDir
  : existsSync(join(dirname(dirname(currentDir)), 'web-dist'))
    ? dirname(dirname(currentDir))
    : currentDir;

const webRoot = existsSync(join(root, 'web-dist', 'server'))
  ? join(root, 'web-dist', 'server')
  : join(root, 'web-dist');

if (existsSync(webRoot)) {
  app.use(express.static(webRoot, { index: 'index.html' }));
  app.get('*', (_req, res) => res.sendFile(join(webRoot, 'index.html')));
}
```

---

### 3.4 Prisma Export SyntaxError: `does not provide an export named 'Prisma'`

**The Symptom:**
```text
SyntaxError: The requested module '@prisma/client' does not provide an export named 'Prisma'
```

**The Cause:**
When `@prisma/client` is installed fresh from npm on cPanel without running `npx prisma generate`, its default CommonJS stub does not export named ESM members like `Prisma`.

**The Fix:**
In TypeScript files, always import `Prisma` as a type if it is only used for type annotations:
```typescript
// ❌ WRONG
import { PrismaClient, Prisma } from '@prisma/client';

// ✅ CORRECT (TypeScript erases this at build time)
import type { PrismaClient, Prisma } from '@prisma/client';
```

---

### 3.5 Eliminating Unused Database Drivers (e.g. PostgreSQL `pg` / SQLite)

**The Symptom:**
```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'pg' imported from app.js
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@prisma/adapter-better-sqlite3'
```

**The Cause:**
If an app supports multiple database engines but the production target is MariaDB/MySQL, static top-level imports of `pg` or `@prisma/adapter-better-sqlite3` will force Node to load them on boot even if they are never used.

**The Fix:**
Use dynamic `import()` for database-specific adapters:
```javascript
export function createPostgresAdapter(connectionString) {
  let pgModule;
  try {
    pgModule = (globalThis).__pg || require('pg');
  } catch {
    throw new Error("PostgreSQL requires 'pg' package. Install pg or use MariaDB.");
  }
  return new pgModule.Pool({ connectionString });
}
```

---

### 3.6 Database Host on cPanel: `localhost` vs Remote LAN IPs

**The Symptom:**
```text
[MariaDB/MySQL] ensureMysqlSchema notice: connect EHOSTUNREACH 192.168.1.110:3306
```

**The Cause:**
Fallback connection strings referencing development LAN IPs (e.g. `192.168.1.110`) are unreachable from cPanel cloud servers.

**The Fix:**
- On cPanel, MariaDB/MySQL runs directly on **`localhost:3306`** (or `127.0.0.1:3306`).
- Standard cPanel database and user names include the account prefix: `cpaneluser_dbname` and `cpaneluser_dbuser`.
- Connection string format:
  ```text
  DATABASE_URL=mysql://cpaneluser_dbuser:password@localhost:3306/cpaneluser_dbname
  ```

---

### 3.7 External Driver Adapters & Resilient GraphQL Health Checks

**The Symptom:**
```text
Error: Cannot find package '@prisma/adapter-mariadb' imported from /home/user/domain.com/app.js
path: ["curatorDatabaseHealth"]
```

**The Cause:**
1. When `esbuild` bundles with `--external:mariadb --external:@prisma/*`, those packages remain external `import(...)` references resolved from the server's `node_modules`. If they are not declared in `package.json` for production, cPanel's `npm install` skips them.
2. Read-only health checks (`curatorDatabaseHealth`, `curatorAgents`, `curatorRequests`) should never dynamically start an uninitialized background worker or crash if an adapter is missing.

**The Fix:**
1. Explicitly list external adapters in the production `package.json` dependencies generated in `scripts/package-cpanel.js`:
   ```json
   "dependencies": {
     "@prisma/adapter-mariadb": "^7.10.0",
     "@prisma/client": "^7.6.0",
     "cheerio": "^1.1.2",
     "express": "^5.1.0",
     "graphql": "^16.11.0",
     "mariadb": "^3.5.4",
     "mysql2": "^3.12.0"
   }
   ```
2. In GraphQL resolvers, never call `startCuratorRuntime` inside read-only query resolvers. If `curatorRuntime?.prisma` is absent, cleanly fall back to querying the database directly with `db.prepare("SELECT ... FROM Agent")` without throwing GraphQL errors.

---

## 4. Standard Build & Packaging Automation

Add this build configuration to `package.json`:

```json
{
  "scripts": {
    "build:web": "vite build --config web/vite.config.ts --mode server",
    "build:server": "esbuild src/server/index.ts --bundle --platform=node --target=node20 --format=esm --banner:js=\"import { createRequire } from 'module'; const require = createRequire(import.meta.url);\" --external:express --external:graphql --external:mysql2 --external:cheerio --external:mariadb --external:@prisma/* --outfile=app.js",
    "build:cpanel": "npm run build:web && npm run build:server",
    "package:cpanel": "node scripts/package-cpanel.js"
  }
}
```

### Complete `scripts/package-cpanel.js` Script

```javascript
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const deployDir = path.join(appRoot, 'deploy');
const zipFile = path.join(appRoot, 'cpanel-deploy.zip');

console.log('>>> [1/4] Building web frontend and bundling server...');
execSync('npm run build:cpanel', { cwd: appRoot, stdio: 'inherit' });

console.log('>>> [2/4] Preparing deploy directory...');
fs.mkdirSync(deployDir, { recursive: true });
for (const file of fs.readdirSync(deployDir)) {
  fs.rmSync(path.join(deployDir, file), { recursive: true, force: true });
}

// Copy bundled server
fs.copyFileSync(path.join(appRoot, 'app.js'), path.join(deployDir, 'app.js'));

// Copy static web assets
fs.cpSync(path.join(appRoot, 'web-dist'), path.join(deployDir, 'web-dist'), { recursive: true });

// Create empty runtime upload/data directory (do not copy heavy local sqlite files)
fs.mkdirSync(path.join(deployDir, 'data'), { recursive: true });

// Production-only package.json (no monorepo links, no devDependencies)
const prodPackage = {
  name: 'cpanel-app',
  version: '1.0.0',
  type: 'module',
  main: 'app.js',
  scripts: { start: 'node app.js' },
  dependencies: {
    'express': '^5.1.0',
    'graphql': '^16.11.0',
    'mysql2': '^3.12.0',
    'cheerio': '^1.1.2'
  }
};
fs.writeFileSync(path.join(deployDir, 'package.json'), JSON.stringify(prodPackage, null, 2));

// Generate .env.example
const envExample = `# cPanel Production Environment Configuration
NODE_ENV=production
# In cPanel, Passenger/LiteSpeed assigns PORT automatically.
PORT=4001
DATABASE_URL=mysql://cpaneluser_dbuser:password@localhost:3306/cpaneluser_dbname
`;
fs.writeFileSync(path.join(deployDir, '.env.example'), envExample);

console.log('>>> [3/4] Creating zip archive for 1-click cPanel upload...');
if (fs.existsSync(zipFile)) fs.unlinkSync(zipFile);

try {
  execSync(`powershell -Command "Compress-Archive -Path '${deployDir}\\*' -DestinationPath '${zipFile}' -Force"`, { stdio: 'inherit' });
  console.log(`>>> [4/4] Done! Upload archive created: ${zipFile}`);
} catch (err) {
  console.log('>>> Package created in deploy/ directory.');
}
```

---

## 5. cPanel "Setup Node.js App" Configuration Reference

In cPanel under **Software** > **Setup Node.js App** (or Veebirakendused):

| Field | Recommended Value | Explanation |
|---|---|---|
| **Node.js version** | `22.x` (or `20.x`) | Select latest stable Node version. |
| **Application mode** | `Production` | Automatically injects `NODE_ENV=production`. |
| **Application root** | `app_folder` | Subfolder in home directory (e.g. `keeris.arula.dev`). Keep separate from `public_html`. |
| **Application URL** | `subdomain.domain.com` | Target domain or path. |
| **Application startup file** | `app.js` | The entry point file bundled by esbuild. |

### Environment Variables
Under **Environment variables** > **Add variable**:
- `DATABASE_URL`: `mysql://cpaneluser_dbuser:password@localhost:3306/cpaneluser_dbname`
- (Optional): Custom application secrets, API keys, intervals.

---

## 6. Verification Checklist

- [ ] `node --check app.js` passes with code 0.
- [ ] `node -e "require('./app.js')"` succeeds locally without `ERR_REQUIRE_ASYNC_MODULE`.
- [ ] No static top-level `await` expressions in server entry point.
- [ ] `createRequire` banner is present at top of `app.js`.
- [ ] No static imports of `@prisma/client` named members (`Prisma`) or unused drivers (`pg`).
- [ ] `web-dist` exists alongside `app.js` and contains `index.html`.
- [ ] Database host is `localhost:3306` (never LAN IPs).
- [ ] In cPanel: click **Run NPM Install** once, then click **Restart**.
- [ ] Health check returns `200 OK` on `https://domain.com/health`.
