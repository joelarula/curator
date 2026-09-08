try {
  process.loadEnvFile?.();
} catch {}

export default {
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL ?? 'file:./data/keeris.db',
  },
};
