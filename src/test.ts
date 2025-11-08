import { addDocuments, semanticSearchWithScore } from './langchain-integration';

async function runTest() {
  try {
    console.log('Starting vector store test...');
    
    // Add test documents
    await addDocuments(
      [
        'PostgreSQL is a powerful, open source object-relational database system.',
        'pgvector is a PostgreSQL extension for vector similarity search.',
        'Langchain is a framework for developing applications powered by language models.',
        'Prisma is a next-generation ORM for Node.js and TypeScript.',
      ],
      [
        { source: 'postgres-docs' },
        { source: 'pgvector-docs' },
        { source: 'langchain-docs' },
        { source: 'prisma-docs' },
      ]
    );
    console.log('Documents added successfully!');

    // Test semantic search
    const searchResults = await semanticSearchWithScore('What is vector search?', 2);
    console.log('\nSearch Results:');
    searchResults.forEach((result: any, i: number) => {
      console.log(`\n${i + 1}. Content: ${result.content}`);
      console.log(`   Score: ${result.score}`);
      console.log(`   Source: ${result.metadata.source}`);
    });

    console.log('\nTest completed successfully!');
  } catch (error) {
    console.error('Test failed:', error);
    throw error;
  }
}

runTest();