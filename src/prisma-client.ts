import { PrismaClient } from '@prisma/client';

// Initialize Prisma Client with pgvector support
const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

export default prisma;

// Helper function for vector similarity search
export async function findSimilarDocuments(
  embedding: number[],
  limit: number = 5,
  namespace?: string
) {
  const embeddingString = `[${embedding.join(',')}]`;
  
  const query = `
    SELECT 
      id,
      content,
      metadata,
      1 - (embedding <=> $1::vector) as similarity
    FROM vector_store
    ${namespace ? 'WHERE namespace = $2' : ''}
    ORDER BY embedding <=> $1::vector
    LIMIT $${namespace ? '3' : '2'}
  `;

  const params = namespace 
    ? [embeddingString, namespace, limit]
    : [embeddingString, limit];

  const results = await prisma.$queryRawUnsafe(query, ...params);
  return results;
}

// Helper function to insert document with vector
export async function insertDocumentWithEmbedding(
  content: string,
  embedding: number[],
  metadata?: any,
  namespace: string = 'default'
) {
  const embeddingString = `[${embedding.join(',')}]`;
  
  const result = await prisma.$executeRaw`
    INSERT INTO vector_store (id, namespace, content, metadata, embedding, "createdAt")
    VALUES (
      gen_random_uuid()::text,
      ${namespace},
      ${content},
      ${JSON.stringify(metadata)}::jsonb,
      ${embeddingString}::vector,
      NOW()
    )
  `;
  
  return result;
}
