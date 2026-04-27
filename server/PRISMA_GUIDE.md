# Padagaskar Server - Prisma & Database Guide

This directory contains the core backend logic and database management for the Padagaskar AI Fact-Checker.

## Prerequisites
- **Docker Desktop** must be running.
- The Postgres container must be started from the root directory:
  ```bash
  docker-compose up -d
  ```

## Prisma CLI Shortcuts
We have pre-configured `package.json` with scripts to manage the database:

### 1. Initialize/Apply Changes
Use this when you modify `prisma/schema.prisma` or want to sync your local database for the first time:
```bash
npm run prisma:migrate
```
*Note: This will prompt for a migration name and apply it to the database.*

### 2. Regenerate Client
If you've updated the schema but don't need a new migration (e.g., after pulling changes), run:
```bash
npm run prisma:generate
```

### 3. Data Browser (GUI)
To view or edit the data currently in your database via a web interface:
```bash
npm run prisma:studio
```

## Environment Configuration
Database connection details are managed in the `.env` file in this directory.
- `DATABASE_URL`: `postgresql://postgres:postgres@localhost:5432/padagaskar?schema=public`

## Advanced Usage
For all other Prisma commands, you can use `npx prisma <command>`.
