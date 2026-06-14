import { provisionSqliteDb } from '../src/db/sqliteProvisioner.js';
import { coreShapes } from '../src/semantic/index.js';

async function seedShapes() {
    console.log('[Seed] Provisioning DB and checking system project...');
    const prisma = await provisionSqliteDb('default', false);

    console.log('[Seed] Seeding Semantic shapes into the system project...');

    const systemUserId = 'system';
    const systemProjectId = 'system';

    // Make sure system user exists
    await prisma.user.upsert({
        where: { id: systemUserId },
        update: {},
        create: { id: systemUserId, name: 'System User', email: 'system@example.com' }
    });

    // Extract all unique URIs that need to be seeded as Resources
    const urisToSeed = new Set<string>();

    for (const shape of coreShapes) {
        urisToSeed.add(shape.uri);
        urisToSeed.add(shape.targetClass);
        for (const [_, prop] of Object.entries(shape.properties)) {
            urisToSeed.add(prop.path);
            if (prop.class) {
                urisToSeed.add(prop.class);
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
