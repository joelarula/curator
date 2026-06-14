import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { defineConfig } from 'prisma/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Local .env is the default — only sets values not already present in the environment.
// This allows provisionSqliteDb to pass a specific DATABASE_URL via execSync env without it being overridden.
dotenv.config({ path: path.resolve(__dirname, '.env') });
// Load parent .env as additional fallback (GOOGLE_API_KEY etc.)
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const databaseUrl = process.env.DATABASE_URL || 'file:data/default.db';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: databaseUrl
  }
});
