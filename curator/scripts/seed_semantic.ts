import { provisionSqliteDb } from '../src/db/sqliteProvisioner.js';
import { coreShapes } from '../src/model/index.js';

async function seedShapes() {
    console.log('[Seed] Provisioning DB and checking system project...');
    const prisma = await provisionSqliteDb('default', false);

    console.log('[Seed] Seeding Semantic shapes into the system project...');

    const systemUserId = 1;
    const systemProjectId = 1;

    await prisma.user.upsert({
        where: { id: systemUserId },
        update: {},
        create: { id: systemUserId, username: 'system', name: 'System User', email: 'system@example.com' }
    });

    // Make sure system project exists
    await prisma.project.upsert({
        where: { id: systemProjectId },
        update: {},
        create: { id: systemProjectId, name: 'System Project', userId: systemUserId }
    });

    // Extract all unique URIs that need to be seeded as Resources
    const urisToSeed = new Set<string>();

    for (const shape of coreShapes) {
        urisToSeed.add(shape.uri);
        urisToSeed.add(shape.targetClass);
        for (const [_, prop] of Object.entries(shape.properties)) {
            urisToSeed.add(prop.path);
            if (prop.class) {
                if (Array.isArray(prop.class)) {
                    for (const cls of prop.class) urisToSeed.add(cls);
                } else {
                    urisToSeed.add(prop.class);
                }
            }
        }
    }

    // Seed them into the database
    let count = 0;
    for (const uri of urisToSeed) {
        await prisma.resource.upsert({
            where: { uri },
            update: { existent: true, deletedAt: null },
            create: {
                uri,
                title: uri,
                userId: systemUserId,
                projectId: systemProjectId
            }
        });
        count++;
    }

    console.log(`[Seed] Successfully seeded ${count} Semantic core resources (classes and properties) into the 'system' project.`);
    
    // Disconnect
    await prisma.$disconnect();
    console.log('[Seed] Done.');
}

seedShapes().catch(e => {
    console.error('[Seed Error]', e);
    process.exit(1);
});
