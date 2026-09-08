---
name: curator-miniapp
description: >-
  Scaffold, build, and maintain standalone Curator MiniApps with GraphQL APIs,
  Vue 3 web frontends, dynamic multi-database support (SQLite, PostgreSQL, MariaDB/MySQL),
  Prisma, and Curator Agent Server orchestration.
---

# Curator MiniApp Development Skill

This skill provides comprehensive instructions, patterns, and templates for building and maintaining standalone **Curator MiniApps**.

A Curator MiniApp is a lightweight, domain-focused application that embeds directly with the **Curator Orchestration Core** (`@curator/agent-server`). It combines domain-specific data management, dynamic multi-database engines, GraphQL API access, interactive Vue 3 web dashboards, and background agent automation workflows.

---

## 1. MiniApp Architecture Overview

A standard Curator MiniApp follows a **Dual Database Architecture**:

```
+-----------------------------------------------------------------------------------+
|                                 CURATOR MINIAPP                                   |
+-----------------------------------------------------------------------------------+
|  Vue 3 + Vite Web Frontend (web/)  <--->  Express + GraphQL API (src/server/)      |
+------------------------------------+----------------------------------------------+
|                                    |                                              |
|   1. Domain Database               |   2. Curator Workflow Database               |
|   (SQLite / Postgres / MariaDB)    |   (SQLite / Postgres via @curator/agent-server) |
|   - App Entities & Business Logic  |   - User, Project, Script, Agent, Request     |
|   - Native Drivers / Prisma        |   - AST Compiled Tool Executions             |
+------------------------------------+----------------------------------------------+
```

### Key Pillars
1. **Multi-Database Support (`src/db.js`)**: Dynamic engine selection (SQLite local file vs PostgreSQL `pg` pool vs MariaDB `mysql2` / Prisma adapter). Automatic SQL query parameter translation (`?` vs `$1`) and schema provisioning.
2. **Curator Plugin & Tool Harness (`src/plugins/`)**: Domain tools and background tasks registered into `curatorEngine` for scheduled or on-demand execution.
3. **GraphQL API Layer (`src/server/graphql.js`)**: Unified GraphQL schema exposing domain queries/mutations alongside Curator Agent statuses (`curatorAgents`) and AST execution history (`curatorRequests`).
4. **Curator Provisioning (`src/setup-curator.js`)**: Registers tools, compiles AST workflows into `Script` entities, and sets up `Agent` cron schedules using Bree.
5. **Vue 3 + Vite Frontend (`web/`)**: Dark-mode responsive dashboard, real-time metrics, search/filter views, and agent management modals.

---

## 2. Directory Structure

```text
miniapps/<miniapp-name>/
├── prisma/
│   └── schema.prisma              # Domain Prisma Schema (Postgres / SQLite / MariaDB)
├── src/
│   ├── db.js                      # Multi-DB engine abstraction & schema helper
│   ├── setup-curator.js           # Curator DB provisioner & tool/agent registration
│   ├── plugins/
│   │   ├── index.js               # Curator plugin aggregator
│   │   └── <domain>-plugin.js     # Domain tools & agent workflows
│   └── server/
│       ├── graphql.js             # GraphQL schema & root resolvers
│       └── index.js               # Express server hosting web static + /graphql
├── web/                           # Vue 3 + Vite web application
│   ├── src/
│   │   ├── App.vue
│   │   ├── main.js
│   │   └── components/
│   └── vite.config.js
├── Dockerfile                     # Standalone container setup
├── docker-compose.yml             # Local Docker Compose setup
└── package.json                   # MiniApp dependencies & scripts
```

---

## 3. Scaffolding a New MiniApp (Step-by-Step)

### Step 1: Package Dependencies (`package.json`)

Ensure `package.json` includes required dependencies for Curator, Prisma, database drivers, and Vue 3:

```json
{
  "name": "<miniapp-name>",
  "private": true,
  "type": "module",
  "scripts": {
    "postinstall": "prisma generate --schema=prisma/schema.prisma",
    "setup:curator": "node src/setup-curator.js",
    "prisma:setup": "prisma db push --schema=prisma/schema.prisma",
    "dev:server": "node --watch src/server/index.js",
    "dev:web": "vite --config web/vite.config.js",
    "build:web": "vite build --config web/vite.config.js",
    "build": "npm run build:web",
    "start": "node src/server/index.js"
  },
  "dependencies": {
    "@curator/agent-server": "file:../../curator",
    "@prisma/adapter-pg": "^7.10.0",
    "@prisma/client": "^7.6.0",
    "express": "^5.1.0",
    "graphql": "^16.11.0",
    "pg": "^8.23.0",
    "vue": "^3.5.18"
  },
  "devDependencies": {
    "prisma": "^7.6.0",
    "vite": "^7.1.3"
  }
}
```

### Step 2: Database Abstraction (`src/db.js`)
Refer to the [Multi-Engine Database Reference](./references/db-multi-engine.md) for full implementation patterns supporting SQLite, PostgreSQL, and MariaDB/MySQL.

### Step 3: Curator Setup & Plugin Engine (`src/plugins/` & `src/setup-curator.js`)
Refer to the [Curator Setup & Tool Registration Guide](./references/setup-curator-template.md) for registering tools, AST scripts, and Bree cron schedules.

### Step 4: GraphQL API (`src/server/graphql.js`)
Refer to the [GraphQL Curator Bridge Reference](./references/graphql-curator-bridge.md) for schema design and resolving both domain data and Curator agent state.

---

## 4. Operational Commands & Deployment

### Local Development
```powershell
# Setup Curator DB & local domain schema
npm run prisma:setup
npm run setup:curator

# Run API Server (port 4000)
npm run dev:server

# Run Web Dev Server (Vite)
npm run dev:web
```

### Docker Deployment
```powershell
# Build container with persistent volumes
docker build -t <miniapp-name> -f Dockerfile .
docker run -d -p 4000:4000 -v <miniapp-data>:/app/data --name <miniapp-container> <miniapp-name>
```

---

## 5. References & Templates

- [Multi-Engine Database Setup Guide](./references/db-multi-engine.md)
- [GraphQL & Curator Bridge Reference](./references/graphql-curator-bridge.md)
- [Curator Setup & Tool Registration Template](./references/setup-curator-template.md)
