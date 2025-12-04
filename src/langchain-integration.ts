import { OpenAI } from '@langchain/openai';
import { HuggingFaceTransformersEmbeddings } from '@langchain/community/embeddings/huggingface_transformers';
import { PrismaVectorStore } from '@langchain/community/vectorstores/prisma';
import { Document } from '@langchain/core/documents';
import { PrismaClient, Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import 'dotenv/config';

const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2'; // 384-dimensional vectors, runs locally

const prisma = new PrismaClient();

// Type for vector store document
type VectorStoreDocument = {
  id: string;
  namespace: string;
  content: string;
  embedding: number[];
  metadata: Prisma.JsonValue;
  createdAt: Date;
};

/**
 * Initialize Langchain with Prisma Vector Store
 */
export async function initializeLangchainVectorStore(): Promise<any> {
  // Use local transformers.js embeddings (no API key needed)
  const embeddings = new HuggingFaceTransformersEmbeddings({
    model: 'Xenova/all-MiniLM-L6-v2', // 384-dimensional vectors, runs locally
  });

  // Create a fresh instance for this operation
  return PrismaVectorStore.withModel<VectorStoreDocument>(prisma).create(
    embeddings,
    {
      prisma: Prisma,
      tableName: 'VectorStore' as const,
      vectorColumnName: 'embedding',
      columns: {
        id: PrismaVectorStore.IdColumn,
        content: PrismaVectorStore.ContentColumn,
        metadata: true,
        namespace: true,
      }
    }
  );
}

/**
 * Add documents to vector store
 */
export async function addDocuments(texts: string[], metadatas?: Record<string, any>[]) {
  const vectorStore = await initializeLangchainVectorStore();
  
  console.log('\n=== Starting addDocuments ===');
  console.log('Input texts:', texts);
  console.log('Input metadata:', metadatas);

  // First check if documents with same content exist
  const existingDocs = await prisma.vectorStore.findMany({
    where: {
      content: {
        in: texts
      }
    },
    select: {
      id: true,
      content: true,
      metadata: true
    }
  });

  console.log('\nExisting documents found:', existingDocs);
  const contentToIdMap = new Map(existingDocs.map(doc => [doc.content, doc.id]));
  
  const documents = texts.map((text, i) => {
    const existingId = contentToIdMap.get(text);
    console.log(`\nProcessing document: "${text}"`);
    console.log('Existing ID found:', existingId || 'none');
    const newId = existingId || uuidv4();
    console.log('Using ID:', newId);
    
    return new Document({
      pageContent: text,
      metadata: {
        ...metadatas?.[i] || {},
        namespace: 'default',
        // Reuse existing ID if document exists, otherwise create new UUID
        id: newId,
      },
    });
  });

  // Enable query logging
  prisma.$use(async (params, next) => {
    const before = Date.now();
    console.log('Query:', JSON.stringify(params, null, 2));
    const result = await next(params);
    const after = Date.now();
    console.log('Query result:', JSON.stringify(result, null, 2));
    console.log('Query took:', after - before, 'ms');
    return result;
  });

    try {
    console.log('\nStarting document addition...');
    console.log('Documents to process:', documents.map(doc => ({
      content: doc.pageContent,
      metadata: doc.metadata
    })));
    
    // Get embeddings for all documents
    const vectors = await vectorStore.embeddings.embedDocuments(
      documents.map(doc => doc.pageContent)
    );    // Insert documents directly using raw SQL
    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < documents.length; i++) {
        const doc = documents[i];
        const vector = vectors[i];
        if (!doc) {
          console.warn(`Document at index ${i} is undefined, skipping.`);
          continue;
        }
        // Use upsert logic with ON CONFLICT
      await tx.$executeRaw`
          INSERT INTO "VectorStore" (id, namespace, content, metadata, embedding, "createdAt")
          VALUES (
            ${doc.metadata.id},
            'default',
            ${doc.pageContent},
            ${JSON.stringify(doc.metadata)}::jsonb,
            ${`[${vector.join(',')}]`}::vector,
            NOW()
          )
          ON CONFLICT (id) 
          DO UPDATE SET
            embedding = ${`[${vector.join(',')}]`}::vector,
            metadata = ${JSON.stringify(doc.metadata)}::jsonb,
            "createdAt" = NOW()
        `;
      }
    });
    
    const count = await prisma.vectorStore.count();
    console.log(`\nOperation complete - Added/Updated ${documents.length} documents (total count: ${count})`);
    
    // Show final state of processed documents
    const finalDocs = await prisma.vectorStore.findMany({
      where: {
        content: {
          in: texts
        }
      },
      select: {
        id: true,
        content: true,
        metadata: true
      }
    });
    console.log('\nFinal state of processed documents:', JSON.stringify(finalDocs, null, 2));
  } catch (error) {
    console.error('Error adding documents:', error);
    throw error;
  }
}

/**
 * Semantic search using Langchain
 */
export async function semanticSearch(query: string, k: number = 5) {
  const vectorStore = await initializeLangchainVectorStore();
  
  const results = await vectorStore.similaritySearch(query, k);
  
  return results.map((doc: any) => ({
    content: doc.pageContent,
    metadata: doc.metadata,
  }));
}

/**
 * Semantic search with scores
 */
export async function semanticSearchWithScore(query: string, k: number = 5) {
  const vectorStore = await initializeLangchainVectorStore();
  
  const results = await vectorStore.similaritySearchWithScore(query, k);
  
  return results.map(([doc, score]: [any, any]) => ({
    content: doc.pageContent,
    metadata: doc.metadata,
    score,
  }));
}

/**
 * Example: Simple RAG (Retrieval Augmented Generation)
 */
export async function ragQuery(question: string) {
  // Search for relevant documents
  const relevantDocs = await semanticSearch(question, 3);
  
  // Combine context
  const context = relevantDocs
    .map((doc: any) => doc.content)
    .join('\n\n');

  // Generate answer using OpenAI
  const llm = new OpenAI({
    openAIApiKey: process.env.OPENAI_API_KEY,
    modelName: 'gpt-4',
    temperature: 0,
  });

  const prompt = `Based on the following context, answer the question.

Context:
${context}

Question: ${question}

Answer:`;

  const answer = await llm.invoke(prompt);
  
  return {
    answer,
    sources: relevantDocs,
  };
}

// Example usage
export async function exampleUsage() {
  try {
    // Show initial state
    const initialDocs = await prisma.vectorStore.findMany({
      select: {
        id: true,
        content: true,
        metadata: true
      }
    });
    console.log('\nInitial documents in database:');
    console.log(JSON.stringify(initialDocs, null, 2));

    // Add some example documents
    await addDocuments(
      [
        'PostgreSQL is a powerful, open source object-relational database system.',
        'pgvector is a PostgreSQL extension for vector similarity search.',
        'Langchain is a framework for developing applications powered by language models.',
        'Prisma is a next-generation ORM for Node.js and TypeScript.',
        'New document 1 for testing.',
        'New document 2 for testing.',
        'Trivial info.',
        'Another trivial info.',
        'Test document that should be new.',
      ],
      [
        { source: 'postgres-docs' },
        { source: 'pgvector-docs' },
        { source: 'langchain-docs' },
        { source: 'prisma-docs' },
        { source: 'test-1' },
        { source: 'test-2' },
        { source: 'xxx' },
        { source: 'xxx-2' },
        { source: 'test-3' },
      ]
    );

    console.log('\nAdding new document...\n');

    // Add some documents again to test upsert behavior
    await addDocuments(
      [
        'Trivial info.',
        'Another trivial info.',
        'Yet another new document.',
        'PostgreSQL is a powerful, open source object-relational database system.', // this one exists
      ],
      [
        { source: 'xxx-updated' },
        { source: 'xxx-2-updated' },
        { source: 'new-test' },
        { source: 'postgres-docs-updated' },
      ]
    );

    // Show all documents
    const allDocs = await prisma.vectorStore.findMany({
      select: {
        id: true,
        content: true,
        metadata: true
      }
    });
    console.log('\nAll documents in database:');
    console.log(JSON.stringify(allDocs, null, 2));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the example if this file is executed directly
if (require.main === module) {
  exampleUsage().catch(console.error);
}
