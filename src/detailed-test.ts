
import { PrismaClient, Prisma } from '@prisma/client';
import type { FileData } from '@prisma/client';
import { save, remove, consult } from './service';
import { xenova_all_minilm_l6_v2 } from './service';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';

const prisma = new PrismaClient();

type SearchResult = {
  content: string;
  score: number;
  metadata?: any;
};

async function runDetailedTest() {
  try {
    console.log('Starting detailed vector store test...');
    
    // Test documents
    const testDocs = [
      { 
        content: 'PostgreSQL is a powerful, open source object-relational database system.',
        source: 'postgres-docs'
      },
      {
        content: 'pgvector is a PostgreSQL extension for vector similarity search.',
        source: 'pgvector-docs'
      },
      {
        content: 'Langchain is a framework for developing applications powered by language models.',
        source: 'langchain-docs'
      },
      {
        content: 'Prisma is a next-generation ORM for Node.js and TypeScript.',
        source: 'prisma-docs'
      }
    ];

    console.log('\nAdding documents...');
    const savedFiles = await Promise.all(testDocs.map(async doc => {
      const content = Buffer.from(doc.content);
      const hash = createHash('sha256').update(content).digest('hex');
      const now = new Date();
      
      const file: FileData = {
        id: 0, // Will be set by DB
        name: `${doc.source}.txt`,
        hash: hash,
        size: content.length,
        mimeType: 'text/plain',
        content: content,
        source: doc.source,
        projectId: 1, // Default project
        createdAt: now,
        updatedAt: now,
      };
      return save(file);
    }));

    console.log(`\n✅ Added ${savedFiles.length} files`);

    // Add OIDC test data as a FileData object from filesystem
    const oidcPath = require('path').join(__dirname, '../data/oidc.txt');
    const oidcBuffer = readFileSync(oidcPath);
    const oidcHash = createHash('sha256').update(oidcBuffer).digest('hex');
    const now = new Date();
    const oidcFile: FileData = {
      id: 0, // Will be set by DB
      name: 'oidc.txt',
      hash: oidcHash,
      size: oidcBuffer.length,
      mimeType: 'text/plain',
      content: oidcBuffer,
      source: 'oidc-spec',
      projectId: 1, // Default project
      createdAt: now,
      updatedAt: now,
    };
    const savedOidcFile = await save(oidcFile);
    console.log(`\n✅ Added OIDC file from filesystem: ${savedOidcFile.name}`);



    // Check the first two files
    const storedFiles = await prisma.fileData.findMany({
      take: 2,
      include: {
        _count: {
          select: {
            Chunk: true
          }
        }
      }
    });

    console.log('\nFirst two stored files:');
    storedFiles.forEach((file, i) => {
      console.log(`\nFile ${i + 1}:`);
      console.log(`Name: ${file.name}`);
      console.log(`Content: ${file.content?.toString()}`);
      console.log(`Number of chunks: ${file._count.Chunk}`);
    });

    // Test semantic search
    console.log('\nTesting semantic search...');
    const searchResults = await consult('vector database', 2);
    
    console.log('\nSearch Results:');
    searchResults.forEach((result: SearchResult, i: number) => {
      console.log(`\n${i + 1}. Content: ${result.content}`);
      console.log(`   Score: ${result.score}`);
    });

    // Test file removal
    //console.log('\nTesting file removal...');
    //const removedFile = await remove('postgres-docs.txt', 1);
    //console.log(`Removed file: ${removedFile?.name}`);

  } catch (error) {
    console.error('Test failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

runDetailedTest().catch(console.error);