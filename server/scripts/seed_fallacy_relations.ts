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

    const predicateUri = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
    const objectUri = "http://schema.org/LogicalFallacy";
    const userId = (await prisma.user.findFirst())?.id;

    if (!userId) {
        console.error("No user found in database");
        return;
    }

    try {
        // Ensure predicate resource exists
        const predicate = await prisma.resource.upsert({
            where: { uri: predicateUri },
            update: {},
            create: {
                uri: predicateUri,
                title: "type",
                userId,
                isPublished: false
            }
        });

        // Ensure object resource exists
        const object = await prisma.resource.upsert({
            where: { uri: objectUri },
            update: {},
            create: {
                uri: objectUri,
                title: "LogicalFallacy",
                userId,
                isPublished: false
            }
        });

        // Find all resources starting with the fallacies URL
        const resources = await prisma.resource.findMany({
            where: {
                uri: {
                    startsWith: "https://www.logicallyfallacious.com/logicalfallacies/"
                }
            }
        });

        console.log(`Found ${resources.length} logicallyfallacious resources to map.`);

        let count = 0;
        for (const res of resources) {
            // Idempotently create relation
            await prisma.relation.upsert({
                where: {
                    subjectId_predicateId_objectId: {
                        subjectId: res.id,
                        predicateId: predicate.id,
                        objectId: object.id
                    }
                },
                update: {},
                create: {
                    subjectId: res.id,
                    predicateId: predicate.id,
                    objectId: object.id,
                    justification: "Seeded for markdown extraction agent validation"
                }
            });
            count++;
        }

        console.log(`Successfully seeded ${count} relations.`);
    } catch (e: any) {
        console.error("Seeding error:", e);
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

main();
