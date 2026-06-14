import { SemanticSchemaEngine } from '../src/services/SemanticSchemaEngine.js';
import { curatorEngine } from '../src/engine/CuratorEngine.js';

export async function run({ prisma, dbName }: { prisma: any, dbName: string }) {
  console.log(`[Seed Test] Initializing SemanticSchemaEngine for test DB '${dbName}'...`);
  
  const engine = new SemanticSchemaEngine(prisma);
  engine.loadRegisteredShapes(curatorEngine);

  const userId = 2; // Test User
  const projectId = 2; // Test Project

  await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, username: 'test_cli', name: 'Test CLI User', email: 'cli@example.com' }
  });

  await prisma.project.upsert({
      where: { id: projectId },
      update: {},
      create: { id: projectId, name: 'Test CLI Project', userId: userId }
  });

  console.log(`[Seed Test] Creating sample semantic entities...`);

  // Create a Sample Folder
  const folderUri = 'folder:test_folder';
  await engine.createEntity('type:folder', folderUri, {
    title: 'My Test Folder',
    description: 'A folder created by the seed_test_db script'
  }, userId, projectId);

  // Create an Article inside it
  const articleUri = 'article:cli_test_1';
  await engine.createEntity('schema:ArticleShape', articleUri, {
    headline: 'Exploring Semantic Graphs via CLI',
    datePublished: new Date(),
    status: 'PUBLISHED',
    keywords: ['CLI', 'Semantic Web', 'TypeScript']
  }, userId, projectId);

  // Link them together
  console.log(`[Seed Test] Linking article to folder...`);
  const folderResource = await prisma.resource.findUnique({ where: { uri: folderUri }});
  const articleResource = await prisma.resource.findUnique({ where: { uri: articleUri }});
  
  if (folderResource && articleResource) {
    const predicateId = await engine['ensureResource'](prisma, 'schema:hasPart', 'schema:hasPart', userId, projectId);
    
    await prisma.relation.upsert({
      where: {
        subjectId_predicateId_objectId: {
          subjectId: folderResource.id,
          predicateId: predicateId.id,
          objectId: articleResource.id
        }
      },
      update: {},
      create: {
        subjectId: folderResource.id,
        predicateId: predicateId.id,
        objectId: articleResource.id
      }
    });
  }

  console.log(`[Seed Test] Successfully provisioned and seeded '${dbName}' with test Semantic Entities!`);
  
  return null; // Return null so ADK Processor doesn't try to queue this as an AST
}
