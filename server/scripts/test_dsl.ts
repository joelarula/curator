import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import { SemanticDslEngine } from '../src/services/SemanticDslEngine.js';

dotenv.config();

const connectionString = process.env.DATABASE_URL!;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool as any);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('[Test] Connecting to Database...');
    const engine = SemanticDslEngine.getInstance(prisma);

    // 1. Resolve or Create Test User and Project
    let user = await prisma.user.findFirst({
        where: { email: 'joel.arula@gmail.com' }
    });
    if (!user) {
        user = await prisma.user.findFirst();
    }
    if (!user) {
        user = await prisma.user.create({
            data: {
                email: 'joel.arula@gmail.com',
                name: 'Joel Arula'
            }
        });
    }

    let project = await prisma.project.findFirst({
        where: { userId: user.id }
    });
    if (!project) {
        project = await prisma.project.create({
            data: {
                name: 'Test Project',
                userId: user.id
            }
        });
    }

    const userId = user.id;
    const projectId = project.id;
    console.log(`[Test] Using User: ${user.email} (ID: ${userId})`);
    console.log(`[Test] Using Project ID: ${projectId}`);

    // 2. Clear out any pre-existing test DSL schema
    await prisma.dslSchema.deleteMany({
        where: { projectId, name: 'ProjectTask' }
    });

    // 3. Dynamically Create and Save a Project-Scoped SASL DSL Schema (MODEL)
    console.log('[Test] Creating dynamic project-scoped schema "ProjectTask" in database...');
    const taskSchemaDef = `
    model ProjectTask {
      uri         String         @id
      title       String         @predicate("schema:title")
      dueDate     DateTime       @predicate("schema:dueDate")
      assignee    Person         @relation("schema:assignee")
      status      ArticleStatus  @relation("schema:status")
    }
    `;

    const dslSchema = await prisma.dslSchema.create({
        data: {
            name: 'ProjectTask',
            type: 'MODEL',
            definition: taskSchemaDef,
            projectId
        }
    });
    console.log(`[Test] Dynamic schema created successfully with DB ID: ${dslSchema.id}`);

    // 4. Retrieve Dynamic Engine Context and Sync Ontology
    console.log('[Test] Retrieving engine context for project...');
    const context = await engine.getEngineContext(projectId);
    
    // Check that our dynamic model is compiled in the context
    if (!context.models['ProjectTask']) {
        throw new Error('Failure: "ProjectTask" model not compiled in engine context!');
    }
    console.log('✔ "ProjectTask" model successfully compiled in dynamic context.');

    console.log('[Test] Syncing dynamic ontology/metamodels to database...');
    await engine.syncOntologyForContext(context, userId, projectId);

    // 5. Define derived entity instance
    const taskData = {
        uri: 'task:test_001',
        title: 'Implement dynamic project-scoped SASL schemas',
        dueDate: new Date('2026-06-30T12:00:00Z'),
        assignee: {
            uri: 'person:joel_test',
            name: 'Joel Test User',
            email: 'joel_test@example.com'
        },
        status: 'DRAFT'
    };

    // 6. Save derived entity
    console.log('[Test] Saving derived entity "ProjectTask"...');
    const savedUri = await engine.saveEntity('ProjectTask', taskData, userId, projectId, context);
    console.log(`[Test] Derived entity saved with URI: ${savedUri}`);

    // 7. Load derived entity
    console.log('[Test] Loading derived entity "ProjectTask"...');
    const loadedTask = await engine.loadEntity('ProjectTask', savedUri, projectId, new Set(), context);
    console.log('[Test] Loaded derived entity payload:');
    console.log(JSON.stringify(loadedTask, null, 2));

    // Assertions on loaded payload
    if (!loadedTask) throw new Error('Failed to load derived entity');
    if (loadedTask.title !== taskData.title) throw new Error('Title mismatch');
    if (loadedTask.status !== 'DRAFT') throw new Error('Enum value mismatch');
    if (!loadedTask.assignee || loadedTask.assignee.name !== 'Joel Test User') throw new Error('Assignee subobject mismatch');
    console.log('✔ Hydrated derived entity properties matching dynamic schema definitions.');

    // 8. List derived entities
    console.log('[Test] Listing all ProjectTask entities in project...');
    const taskList = await engine.listEntities('ProjectTask', projectId);
    console.log(`[Test] Found ${taskList.length} ProjectTask entities:`);
    console.log(JSON.stringify(taskList, null, 2));
    if (taskList.length !== 1) throw new Error('List entities count mismatch');

    // 9. Soft-delete derived entity
    console.log('[Test] Deleting derived entity task:test_001...');
    const deleteSuccess = await engine.deleteEntity('ProjectTask', 'task:test_001', projectId);
    if (!deleteSuccess) throw new Error('Soft-delete failed');

    // Re-list and verify deletion
    const finalTaskList = await engine.listEntities('ProjectTask', projectId);
    console.log(`[Test] Entities list after deletion: ${finalTaskList.length} found.`);
    if (finalTaskList.length !== 0) throw new Error('Entity still returned in list query after deletion!');
    console.log('✔ Derived entity successfully soft-deleted.');

    // 10. Test System Schema Integration
    console.log('[Test] Testing System Schema Integration...');
    await prisma.dslSchema.deleteMany({
        where: { projectId: 'system', name: 'SystemConfig' }
    });
    const systemSchemaDef = `
    model SystemConfig {
      uri         String         @id
      key         String         @predicate("schema:systemKey")
      value       String         @predicate("schema:systemValue")
    }
    `;
    await prisma.dslSchema.create({
        data: {
            name: 'SystemConfig',
            type: 'MODEL',
            definition: systemSchemaDef,
            projectId: 'system'
        }
    });

    // Resolve context for the user's custom project context
    const userProjContext = await engine.getEngineContext(projectId);
    
    if (!userProjContext.models['SystemConfig']) {
        throw new Error('Failure: "SystemConfig" system schema was not inherited by the project context!');
    }
    console.log('✔ "SystemConfig" system schema was successfully inherited by project context!');

    // Clean up test system schema
    await prisma.dslSchema.deleteMany({
        where: { projectId: 'system', name: 'SystemConfig' }
    });

    console.log('✔ All dynamic schema CRUD and inheritance tests passed successfully!');
}

main()
    .catch((err) => {
        console.error('[Test Error]', err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
        console.log('[Test] Disconnected.');
    });
