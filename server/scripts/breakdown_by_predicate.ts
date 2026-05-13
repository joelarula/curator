import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import pkg from 'pg';
const { Pool } = pkg;
import { PrismaPg } from '@prisma/adapter-pg';

// Setup Prisma with the Postgres adapter
const connectionString = process.env.DATABASE_URL!;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool as any);
const prisma = new PrismaClient({ adapter });

async function main() {
    // Check if the user passed a predicate argument, default to "err:about"
    const predicateUri = process.argv[2] || 'err:about';

    console.log(`\n📊 Breakdown of resources for predicate: "${predicateUri}"\n`);

    // Using raw SQL because Prisma groupBy doesn't support grouping by joined fields (object.uri)
    const results: any[] = await prisma.$queryRaw`
        SELECT 
            o.uri as "objectUri", 
            COUNT(r.id)::int as "resourceCount"
        FROM "Relation" r
        JOIN "Resource" p ON r."predicateId" = p.id
        JOIN "Resource" o ON r."objectId" = o.id
        WHERE p.uri = ${predicateUri}
          AND r.existent = true
        GROUP BY o.uri
        ORDER BY "resourceCount" DESC
    `;

    if (results.length === 0) {
        console.log(`No relations found for predicate: ${predicateUri}`);
        return;
    }

    // Print out a nicely formatted table
    console.table(results.map(row => ({
        Object: row.objectUri,
        Count: row.resourceCount
    })));
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });
