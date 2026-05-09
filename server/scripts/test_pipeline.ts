import { AIQ } from '../src/services/AIQ.js';
import { PrismaClient } from '@prisma/client';
import { RequestProcessor } from '../src/services/RequestProcessor.js';
import dotenv from 'dotenv';
import pkg from 'pg';
const { Pool } = pkg;
import { PrismaPg } from '@prisma/adapter-pg';

dotenv.config();

async function main() {
    const connectionString = process.env.DATABASE_URL!;
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool as any);
    const prisma = new PrismaClient({ adapter });
    
    const processor = new RequestProcessor(prisma);
    processor.isAdHoc = true; // Process everything in one go for the test
    
    // 1. Setup test data
    console.log('--- Setting up test data ---');
    const user = await prisma.user.upsert({
        where: { email: 'test@example.com' },
        update: {},
        create: {
            email: 'test@example.com',
            name: 'Test User',
        }
    });

    const conversation = await prisma.conversation.create({
        data: {
            userId: user.id,
            // title: 'Test Pipeline Conversation' // removed, not in schema
        }
    });

    console.log(`User ID: ${user.id}, Conversation ID: ${conversation.id}`);

    // 2. Define a complex pipeline using chain() and spawn()
    // Workflow: fetch_html -> scrape_resource (chain) -> classify_udc (spawn)
    console.log('\n--- Defining Pipeline ---');
    const pipeline = AIQ.start()
        .fetch_html({ url: 'https://example.com' })
        .scrape_resource({ url: '{{resource.uri}}' }) // Use placeholder
        .spawn('classify_udc', { model: 'gemini-1.5-flash-lite' })
        .toJSON();

    console.log('Pipeline JSON:', JSON.stringify(pipeline, null, 2));

    // 3. Create the Request record
    console.log('\n--- Creating Request ---');
    const request = await prisma.request.create({
        data: {
            userId: user.id,
            conversationId: conversation.id,
            status: 'NEW',
            toolCalls: pipeline as any,
            toolName: pipeline[0].name,
            toolArgs: pipeline[0].args
        }
    });

    // 4. Process the Request
    console.log(`\n--- Processing Request ${request.id} ---`);
    await processor.processRequest(request);

    // 5. Verify results
    console.log('\n--- Verifying Results ---');
    const finalRequest = await prisma.request.findUnique({
        where: { id: request.id },
        include: { 
            responses: true,
            resources: { include: { resourceType: true } }
        }
    });

    console.log(`Main Request Status: ${finalRequest?.status}`);
    console.log(`Resources created: ${finalRequest?.resources.length}`);
    finalRequest?.resources.forEach(r => {
        console.log(` - [${r.resourceType?.name || 'UNKNOWN'}] ${r.uri} (${r.title})`);
    });

    // Check for spawned child requests
    const children = await prisma.request.findMany({
        where: { parentId: request.id }
    });
    console.log(`Child requests spawned: ${children.length}`);
    for (const child of children) {
        console.log(` - Child ID ${child.id}: ${child.toolName} (Status: ${child.status})`);
        // The processor should have processed this child because isAdHoc = true
    }

    await prisma.$disconnect();
    console.log('\n--- Test Complete ---');
}

main().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
});
