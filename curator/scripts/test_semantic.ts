import { provisionSqliteDb } from '../src/db/sqliteProvisioner.js';
import { SemanticSchemaEngine } from '../src/services/SemanticSchemaEngine.js';
import { ArticleShape, PersonShape, LanguageShape, TextObjectShape, FolderShape } from '../src/model/index.js';

async function run() {
    const prisma = await provisionSqliteDb('test_shacl_db', true);
    const engine = new SemanticSchemaEngine(prisma as any);
    engine.registerShape(PersonShape);
    engine.registerShape(ArticleShape);
    engine.registerShape(LanguageShape);
    engine.registerShape(TextObjectShape);
    engine.registerShape(FolderShape);

    console.log('[Test] Cleaning up test data...');
    await prisma.relation.deleteMany({ where: { projectId: 2 } });
    await prisma.resource.deleteMany({ where: { projectId: 2 } });

    console.log('[Test] Creating entity...');
    const subjectUri = 'article:1';
    const data = {
        headline: 'Graph Databases are Cool',
        articleBody: {
            textValue: 'This is a very long text blob that should be stored as a separate Resource instead of a literal string relation...',
            inLanguage: 'lang:en',
            mentions: ['article:2', 'wiki:1']
        },
        datePublished: new Date(),
        status: 'DRAFT',
        keywords: ['Graph DB', 'Semantic Web', 'Knowledge Graph']
    };

    const userId = 2;
    // Let's make sure the user and project exist first, since Resource has a foreign key to User and Project
    await prisma.user.upsert({
        where: { id: userId },
        update: {},
        create: { id: userId, username: 'test_user', name: 'Test User', email: 'test@example.com' }
    });

    await prisma.project.upsert({
        where: { id: 2 },
        update: {},
        create: { id: 2, name: 'Test Project', userId }
    });

    // Also need to create the author and language
    await engine.createEntity(LanguageShape.uri, 'lang:en', { name: 'English', alternateName: 'en' }, userId, 1);
    await engine.createEntity(PersonShape.uri, 'user:123', { name: 'Alice', email: 'alice@test.com' }, userId, 2);

    await engine.createEntity(ArticleShape.uri, subjectUri, data, userId, 2);
    console.log('[Test] Created successfully.');

    // Test folder organization
    const parentFolderUri = 'folder:1';
    await engine.createEntity(FolderShape.uri, parentFolderUri, { name: 'Root Folder' }, userId, 2);
    
    const subFolderUri = 'folder:2';
    await engine.createEntity(FolderShape.uri, subFolderUri, { 
        name: 'Pending Review', 
        parentFolder: parentFolderUri,
        contains: [subjectUri] // Put the article inside this folder
    }, userId, 2);

    console.log('[Test] Reading subfolder...');
    const subFolder = await engine.readEntity(FolderShape.uri, subFolderUri, [2]);
    console.log('SubFolder Result:', subFolder);

    console.log('[Test] Reading entity...');
    const entity = await engine.readEntity(ArticleShape.uri, subjectUri, [2]);
    console.log('Read Result:', entity);

    console.log('[Test] Updating entity...');
    await engine.updateEntity(ArticleShape.uri, subjectUri, { status: 'PUBLISHED', articleBody: { textValue: 'Updated long text blob!', inLanguage: 'lang:en' } }, userId, 2);
    const updatedEntity = await engine.readEntity(ArticleShape.uri, subjectUri, [2]);
    console.log('Updated Result:', updatedEntity);

    console.log('[Test] Deleting entity...');
    await engine.deleteEntity(subjectUri, 2);
    const deletedEntity = await engine.readEntity(ArticleShape.uri, subjectUri, [2]);
    console.log('Deleted Result (should be null):', deletedEntity);

    // Test Person and Inverse Properties
    const personUri = 'user:123';
    await engine.createEntity(PersonShape.uri, personUri, { 
        name: 'Jane Graph', 
        email: 'jane@graph.com' // Valid pattern
    }, userId, 2);

    // Test Invalid Regex
    try {
        await engine.createEntity(PersonShape.uri, 'user:bad', { 
            name: 'Bad Email', 
            email: 'not-an-email' 
        }, userId, 2);
        throw new Error("Should have thrown regex error!");
    } catch (e: any) {
        console.log('[Test] Successfully caught regex error:', e.message);
    }

    console.log('[Test] Reading inverse authoredArticles...');
    const personWithArticles = await engine.readEntity(PersonShape.uri, personUri, [2]);
    console.log('Inverse Result (Person):', personWithArticles);

    console.log('[Test] All complete.');
    await prisma.$disconnect();
}

run().catch(e => {
    console.error(e);
    process.exit(1);
});
