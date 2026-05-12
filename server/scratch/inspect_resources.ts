import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import pkg from 'pg';
const { Pool } = pkg;
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
    const connectionString = process.env.DATABASE_URL!;
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool as any);
    const prisma = new PrismaClient({ adapter });

    const item = await prisma.resource.findUnique({
        where: { uri: 'https://sport.err.ee/1610021596/talts-lubab-toelist-korvpallipidu-pulli-peab-saama' },
        include: {
            subjectRelations: {
                include: {
                    predicate: true,
                    object: true
                }
            }
        }
    });

    if (!item) {
        console.log('Resource not found!');
        return;
    }

    console.log(`Relations for ${item.uri}:`);
    item.subjectRelations.forEach(r => {
        console.log(`- [${r.predicate.uri}] -> ${r.object.uri} (${r.object.title})`);
    });

    await prisma.$disconnect();
    await pool.end();
}

main();
