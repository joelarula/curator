import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL!;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool as any);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('--- KNOWLEDGE BACKBONE AUDIT ---');
    const resources = await prisma.resource.findMany({
        take: 50,
        orderBy: { createdAt: 'desc' },
        include: {
            subjectRelations: {
                include: {
                    predicate: true,
                    object: true
                }
            }
        }
    });

    if (resources.length === 0) {
        console.log('No resources found in database.');
        return;
    }

    resources.forEach(r => {
        const typeRel = r.subjectRelations.find(rel => rel.predicate.uri === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
        const type = typeRel ? typeRel.object.title : 'No Type';
        console.log(`[${r.id}] ${type.padEnd(20)} | ${r.title?.substring(0, 50)} | ${r.uri}`);
    });
}

main()
    .catch(console.error)
    .finally(() => {
        prisma.$disconnect();
        pool.end();
    });
