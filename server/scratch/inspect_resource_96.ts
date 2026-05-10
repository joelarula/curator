import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const resourceId = 96;
    const resource = await prisma.resource.findUnique({
        where: { id: resourceId },
        include: {
            subjectRelations: {
                include: {
                    predicate: true,
                    object: true
                }
            }
        }
    });

    if (!resource) {
        console.log(`Resource ${resourceId} not found`);
        return;
    }

    console.log(`Resource ${resourceId} (${resource.uri}) has ${resource.subjectRelations.length} subject relations:`);
    resource.subjectRelations.forEach((r, i) => {
        console.log(`  [${i}] --(${r.predicate.uri})--> ${r.object.uri}`);
    });
}

main().catch(console.error).finally(() => prisma.$disconnect());
