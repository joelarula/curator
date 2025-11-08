import { PrismaClient } from '@prisma/client';
import { addDocuments, semanticSearchWithScore } from './langchain-integration';

const prisma = new PrismaClient();

async function runDetailedTest() {
  try {
    console.log('Starting detailed vector store test...');
    
    // Use transaction for data deletion and addition
   // await prisma.$transaction(async (tx) => {
      // Clear existing data
      //await tx.vectorStore.deleteMany();
   //   console.log('Cleared existing data');
   // });
    
    // Add test documents
    const testDocs = [
      'PostgreSQL is a powerful, open source object-relational database system.',
      'pgvector is a PostgreSQL extension for vector similarity search.',
      'Langchain is a framework for developing applications powered by language models.',
      'Prisma is a next-generation ORM for Node.js and TypeScript.',
    ];

    const testMetadata = [
      { source: 'postgres-docs' },
      { source: 'pgvector-docs' },
      { source: 'langchain-docs' },
      { source: 'prisma-docs' },
    ];

    console.log('\nAdding documents...');
    await prisma.$transaction(async (tx) => {
      await addDocuments(testDocs, testMetadata);
      console.log('Documents added in transaction');
    });

    // Verify documents were added
    const count = await prisma.vectorStore.count();
    console.log(`\nNumber of documents in vector_store: ${count}`);

    // Check a few documents
    const storedDocs = await prisma.vectorStore.findMany({
      take: 2,
      select: {
        id: true,
        content: true,
        metadata: true,
        namespace: true
      }
    });

    console.log('\nFirst two stored documents:');
    storedDocs.forEach((doc, i) => {
      console.log(`\nDocument ${i + 1}:`);
      console.log(`Content: ${doc.content}`);
      console.log(`Metadata: ${JSON.stringify(doc.metadata)}`);
      // Note: Embedding is stored but not accessible through Prisma directly
    });

    // Test search
    console.log('\nTesting search...');
    const searchResults = await semanticSearchWithScore('vector database', 2);
    
    console.log('\nSearch Results:');
    searchResults.forEach((result: any, i: number) => {
      console.log(`\n${i + 1}. Content: ${result.content}`);
      console.log(`   Score: ${result.score}`);
      console.log(`   Source: ${result.metadata.source}`);
    });

  } catch (error) {
    console.error('Test failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

runDetailedTest().catch(console.error);