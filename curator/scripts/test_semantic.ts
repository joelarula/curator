import { provisionSqliteDb } from '../src/db/sqliteProvisioner.js';
import { SemanticSchemaEngine } from '../src/services/SemanticSchemaEngine.js';
import { ArticleShape, PersonShape, LanguageShape, TextObjectShape } from '../src/semantic/index.js';

async function run() {
    const prisma = await provisionSqliteDb('test_shacl_db', true);
    const engine = new SemanticSchemaEngine(prisma as any);
    engine.registerShape(PersonShape);
    engine.registerShape(ArticleShape);
    engine.registerShape(LanguageShape);
    engine.registerShape(TextObjectShape);

    console.log('[Test] Cleaning up test data...');
    await prisma.relation.deleteMany({ where: { projectId: 'test-project' } });
    await prisma.resource.deleteMany({ where: { projectId: 'test-project' } });

    console.log('[Test] Creating entity...');
    const subjectUri = 'article:1';
    const data = {
        headline: 'Graph Databases are Cool',
        articleBody: {
            textValue: 'This is a very long text blob that should be stored as a separate Resource instead of a literal string relation...',
            inLanguage: 'lang:en'
        },
        datePublished: new Date(),
        status: 'DRAFT'
    };

    const userId = 'system-user';
    // Let's make sure the user and project exist first, since Resource has a foreign key to User and Project
    await prisma.user.upsert({
        where: { id: userId },
        update: {},
        create: { id: userId, name: 'System User', email: 'sys@test.com' }
    });

    await prisma.project.upsert({
        where: { id: 'test-project' },
        update: {},
        create: { id: 'test-project', name: 'Test Project', userId }
    });

    // Also need to create the author and language
    await engine.createEntity(LanguageShape.uri, 'lang:en', { name: 'English', alternateName: 'en' }, userId, 'system');
    await engine.createEntity(PersonShape.uri, 'user:123', { name: 'Alice', email: 'alice@test.com' }, userId, 'test-project');

    await engine.createEntity(ArticleShape.uri, subjectUri, data, userId, 'test-project');
    console.log('[Test] Created successfully.');

    console.log('[Test] Reading entity...');
    const entity = await engine.readEntity(ArticleShape.uri, subjectUri, ['test-project']);
    console.log('Read Result:', entity);

    console.log('[Test] Updating entity...');
    await engine.updateEntity(ArticleShape.uri, subjectUri, { status: 'PUBLISHED', articleBody: { textValue: 'Updated long text blob!', inLanguage: 'lang:en' } }, userId, 'test-project');
    const updatedEntity = await engine.readEntity(ArticleShape.uri, subjectUri, ['test-project']);
    console.log('Updated Result:', updatedEntity);

    console.log('[Test] Deleting entity...');
    await engine.deleteEntity(subjectUri, 'test-project');
    const deletedEntity = await engine.readEntity(ArticleShape.uri, subjectUri, ['test-project']);
    console.log('Deleted Result (should be null):', deletedEntity);

    console.log('[Test] All complete.');
    await prisma.$disconnect();
}

run().catch(e => {
    console.error(e);
    process.exit(1);
});
