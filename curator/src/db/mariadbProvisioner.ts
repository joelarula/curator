import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function provisionMariadbDb(connectionUrl: string = process.env.CURATOR_DATABASE_URL || 'mysql://curator:curator_secret@192.168.1.110:3306/curator'): Promise<any> {
  const { PrismaMariaDb } = await import('@prisma/adapter-mariadb');
  const mariadbMod = await import('mariadb');
  const mariadb = mariadbMod.default || mariadbMod;

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
  
  let MariadbPrismaClient: any;
  const potentialPaths = [
    path.join(__dirname, '../generated/prisma-mariadb/index.js'),
    path.join(__dirname, '../../src/generated/prisma-mariadb/index.js'),
    path.join(__dirname, '../../../curator/src/generated/prisma-mariadb/index.js'),
  ];
  for (const p of potentialPaths) {
    if (fs.existsSync(p)) {
      const mod = await import(pathToFileURL(p).href);
      MariadbPrismaClient = mod.PrismaClient;
      break;
    }
  }
  if (!MariadbPrismaClient) {
    const mod = await import('@prisma/client');
    MariadbPrismaClient = mod.PrismaClient;
  }

  const prisma = new (MariadbPrismaClient as any)({ adapter });

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
