# Keeris - ERR Radio Music & Episode Archive

Keeris is a standalone Curator miniapp for scraping, indexing, deduplicating, and exploring music airings and episodes across ERR radio broadcasts (Vikerraadio, Klassikaraadio).

## Architecture

- **Domain Archive Database** (`data/keeris.db`): Stores extracted episodes, tracklists, play counts, and unique song deduplication records.
- **Workflow & Agent Database** (`data/curator.db`): Tracks Curator `Request`, `Response`, `Conversation`, `Script`, and `Agent` records managed by `CuratorRequestProcessor`.
- **Agent Scheduling**: Uses **[Bree](https://github.com/breejs/bree)** (`ScheduledAgentScheduler`) to run recurring agent tasks using either 5-field cron syntax or human-readable interval strings.

## Agent Scheduling Formats

Agent schedules support both Bree-compatible syntaxes:

- **Cron Expressions**: `0 * * * *` (hourly), `*/10 * * * *` (every 10 minutes), `0 0 * * *` (daily).
- **Text Intervals**: `every 10 minutes`, `every 1 hour`, `at 8:00 am`.

For full documentation on schedule patterns, see:
- [Bree Documentation](https://github.com/breejs/bree)
- [Bree Official Website](https://jobscheduler.net/)
- [@breejs/later Syntax Guide](https://github.com/breejs/later)

## WASM Client-Side Runtime & Static App

Keeris can run as a **completely self-contained, offline-capable static WASM web application** without needing a Node.js or PostgreSQL backend:

- **In-Browser SQLite WASM**: Runs `@sqlite.org/sqlite-wasm` via a dedicated Web Worker (`wasm/db-worker.js`).
- **OPFS Persistence**: Persists all episodes, tracks, and Curator AST execution state directly to the browser's Origin Private File System (`/keeris.sqlite3`).
- **Static Seed Streaming**: On initial launch, if no local database exists, it automatically downloads and mounts the pre-seeded SQLite database (`/data/keeris.db`).
- **Curator AST & Agent Engine**: Scrapes and processes radio broadcasts client-side in the browser using the in-worker Curator AST runner (`wasm/wasm-curator-engine.js`).

---

## Development Workflows

### 1. Run Static WASM Web App (Vite Dev Server)

Runs the Vue 3 + Vuetify frontend with live hot-reloading and direct OPFS WASM worker:

```powershell
cd miniapps/keeris
npm run dev:web
```

- App runs at: `http://localhost:3000`
- The client automatically detects there is no server running and boots the in-worker SQLite WASM database.

### 2. Run Hybrid Mode (Node.js Server + Web App)

If you want to run the full server with Express GraphQL API:

```powershell
# Terminal 1: Backend API (port 4000)
npm run dev:server

# Terminal 2: Web Frontend (port 3000)
npm run dev:web
```

---

## Building the Static WASM Bundle

To generate a standalone distribution bundle ready to be served from **any static web server** (GitHub Pages, Cloudflare Pages, S3, Netlify, Nginx):

```powershell
cd miniapps/keeris

# 1. Export the latest SQLite database seed into web/data/
npm run export:seed

# 2. Build the production web bundle into web-dist/
npm run build:web
```

Or run the combined build shortcut:

```powershell
npm run build
```

This generates:

```text
miniapps/keeris/web-dist/
├── index.html                   # HTML entry point
├── assets/                      # Bundled Vue 3 + Vuetify application (JS, CSS, fonts)
├── data/
│   └── keeris.db                # Static seed SQLite database (streamed on first load)
└── wasm/
    ├── db-worker.js             # Web Worker orchestration loop
    ├── sqlite-opfs.js           # @sqlite.org/sqlite-wasm OPFS driver
    ├── wasm-curator-engine.js   # Client-side Curator AST & scraping engine
    └── graphql-schema.js        # In-browser GraphQL resolvers
```

---

## Serving the Static WASM Bundle

Serve `web-dist/` with any static server:

```powershell
# Using npm script (includes -s for SPA routes)
npm run preview:web

# Or directly with npx serve
npx serve -s web-dist -p 3000 -c serve.json

# Using Python
python -m http.server -d web-dist 3000
```

> [!NOTE]
> **Browser Storage & OPFS Headers**:
> Modern browsers provide high-speed disk I/O for SQLite WASM using the **Origin Private File System (OPFS)**. For maximum throughput with `FileSystemSyncAccessHandle`, static servers should set the following HTTP headers:
> ```http
> Cross-Origin-Opener-Policy: same-origin
> Cross-Origin-Embedder-Policy: require-corp
> ```
> *(Vite's dev server sets these automatically in `web/vite.config.js`).*

---

## CLI & Legacy Commands

```powershell
# Run the local web app & API
node src/server/index.js

# View archive stats
node src/cli.js stats

# List registered agents & schedules
node src/cli.js agents
```

## Docker Deployment

Build and start the container with persistent storage:

```powershell
# Build and run with Docker Compose
npm run docker:up

# View real-time logs
npm run docker:logs

# Stop container
npm run docker:down
```

