# Curator

Curator is a semantic document management system. This project uses PostgreSQL (with pgvector), Prisma, Apollo Server (GraphQL), and LangChain for RAG-based interactions.

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js**: v18+ 
- **Docker**: For running the PostgreSQL database.
- **API Keys**: OpenAI or Google Gemini (depending on the embedding/LLM model used).

### 2. Environment Setup
Copy the example environment file and fill in your keys:
```bash
cp .env.example .env
```

### 3. Database Setup
Start the PostgreSQL container:
```bash
docker-compose up -d
```

### 4. Install Dependencies
```bash
npm install
```

### 5. Database Setup & Maintenance
Initialize your database schema and seed initial data:
```bash
# 1. Generate the Prisma client
npm run prisma:generate

# 2. Sync schema to database (Prototyping/Initial Setup)
npm run prisma:push

# 3. Create/Run migrations (Development)
npm run prisma:migrate

# 4. Seed the database (Optional)
npx prisma db seed
```

---

## 🛠️ Available Scripts

### Development
- `npm run dev`: Runs both the server and the client concurrently.
- `npm run dev:server`: Starts the backend server only (with auto-reload).
- `npm run dev:client`: Starts the Vite development server for the frontend.

### Database Maintenance (Prisma)
- `npm run prisma:generate`: Regenerates the Prisma Client.
- `npm run prisma:migrate`: Creates a new migration and applies it to the DB.
- `npm run prisma:push`: Syncs the schema with the database WITHOUT creating migrations.
- `npm run prisma:studio`: Opens a browser UI (GUI) to view and edit your database data.
- `npx prisma db seed`: Runs the seeding script defined in `prisma/seed.ts`.
- `npx prisma migrate reset`: **CAUTION**: Deletes all data and reapplies all migrations (useful for a clean slate).

### Testing & CLI
- `npm run test`: Runs the detailed test suite (`src/detailed-test.ts`).
- `npm run cli`: Runs the command-line interface (`src/cli.ts`).

### Production
- `npm run build`: Builds both the client and server for production.
- `npm run build:client`: Builds the frontend (Vite).
- `npm run build:server`: Compiles the server TypeScript code.
- `npm run start`: Starts the application in production mode.

---

## 📁 Project Structure
- `server/`: Express + Apollo Server backend.
  - `schema/`: GraphQL type definitions.
  - `resolvers/`: GraphQL resolvers (queries/mutations).
- `client/`: Vue 3 + Vuetify + Apollo Client frontend.
- `prisma/`: Database schema and migrations.
- `data/`: Local storage for processed files and indices.

## 🤖 Agent Instructions
For AI agents working on this project, please refer to [AGENT.md](./AGENT.md) for architectural patterns and [project rules](./.cursorrules).
