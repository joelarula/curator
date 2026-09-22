import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import mariadb from 'mariadb';

export async function provisionMariadbDb(connectionUrl: string = process.env.CURATOR_DATABASE_URL || 'mysql://curator:curator_secret@192.168.1.110:3306/curator'): Promise<any> {
  const url = new URL(connectionUrl);
  const pool = mariadb.createPool({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: url.username,
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
    connectionLimit: 10,
  });

  const adapter = new PrismaMariaDb(pool as any);
  const { PrismaClient } = await import('../generated/prisma-mariadb/index.js');
  const prisma = new (PrismaClient as any)({ adapter });

  // Ensure system user and project exist
  const user = await prisma.user.upsert({
    where: { email: 'system@local' },
    update: {},
    create: { id: '1', name: 'System User', email: 'system@local' },
  });

  await prisma.project.upsert({
    where: { id: '1' },
    update: {},
    create: { id: '1', name: 'Keeris', userId: user.id },
  });

  return prisma;
}
