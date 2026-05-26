// prisma.sqlite.config.js
// Used exclusively by `curator run --db <name>` for named SQLite databases.
// DATABASE_URL is injected by sqliteProvisioner.ts at runtime.
require('dotenv').config();

module.exports = {
  schema: 'prisma/sqlite/schema.prisma',
  migrations: {
    path: 'prisma/sqlite/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
};
