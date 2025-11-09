import { HuggingFaceTransformersEmbeddings } from '@langchain/community/embeddings/huggingface_transformers';
import { PrismaVectorStore } from '@langchain/community/vectorstores/prisma';
import { Document } from '@langchain/core/documents';
import { PrismaClient, Prisma, Chunk, FileData, FileDataType } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import 'dotenv/config';

const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2'; // 384-dimensional vectors, runs locally

const prisma = new PrismaClient();

//const enabled = process.env.ENABLE_VECTOR_STORE === 'true';

export async function initializeLangchainVectorStore(): Promise<any> {

  const embeddings = new HuggingFaceTransformersEmbeddings({
    model: EMBEDDING_MODEL 
  });

  return PrismaVectorStore.withModel<Chunk>(prisma).create(
    embeddings,
    {
      prisma: Prisma,
      tableName: 'Chunk' as const,
      vectorColumnName: 'xenova_all_minilm_l6_v2',
      columns: {
        id: PrismaVectorStore.IdColumn,
        text: PrismaVectorStore.ContentColumn,
        hash: true,
        version: true,
        fileId: true,
        modelId: true,

      }
    }
  );
}


export async function saveFile(file: FileData) {
    
    console.log(`✅ Adding file "${file.name}"`);
    const vectorStore = await initializeLangchainVectorStore();

    try {

        const latestVersion = await prisma.fileData.findFirst({
            where: {
                name: file.name,
                projectId: file.projectId
            },
            orderBy: {
                version: 'desc'
            },
            select: {
                version: true,
                hash: true
            }
        });

        const nextVersion = latestVersion && latestVersion.hash !== file.hash
            ? latestVersion.version + 1 : latestVersion?.version || 1;
        
        const savedFile = await prisma.fileData.upsert({
            where: { 
                name_projectId: { 
                    name: file.name,
                    projectId: file.projectId
                }
            },
            update: {
                version: nextVersion,
                hash: file.hash,
                content: file.content,
                size: file.size,
                mimeType: file.mimeType,
                source: file.source,
            },
            create: {
                name: file.name,
                type: file.type,
                hash: file.hash,
                size: file.size,
                mimeType: file.mimeType,
                content: file.content,
                source: file.source,
                version: nextVersion,
                projectId: file.projectId,
            }
        });

        
        if (file.type === FileDataType.TEXT && file.content) {
            const text = file.content.toString('utf-8');
            console.log(`✅ Adding text "${text}"`);

            const model = await prisma.model.findFirst({
                where: { name: EMBEDDING_MODEL }
            });

            if (!model) {
                throw new Error('Default embedding model not found');
            }

            const embeddings = new HuggingFaceTransformersEmbeddings({
                model: EMBEDDING_MODEL
            });

            const vectorData = await embeddings.embedQuery(text);
            console.log(`✅ Embeddings created: "${vectorData}"`);

            // Create chunk
            const chunk = await prisma.$executeRaw`
                INSERT INTO "Chunk" (
                    "fileId", 
                    "text", 
                    "hash", 
                    "version", 
                    "modelId", 
                    "xenova_all_minilm_l6_v2",
                    "createdAt",
                    "updatedAt",
                    "selection"
                )
                VALUES (
                    ${savedFile.id}, 
                    ${text}, 
                    ${file.hash}, 
                    ${file.version}, 
                    ${model.id}, 
                    ${`[${vectorData.join(',')}]`}::vector,
                    NOW(),
                    NOW(),
                    NULL
                )
            `;
        }

        console.log('✅ File and chunks created successfully');
        return savedFile;
        
    } catch (error) {
        console.error('Error adding file:', error);
        throw error;
    }
}




/**
 * Query data with scores
 */
export async function queryData(query: string, k: number = 5) {
  const vectorStore = await initializeLangchainVectorStore();
  
  const results = await vectorStore.similaritySearchWithScore(query, k);
  
  return results.map(([doc, score]: [any, any]) => ({
    content: doc.pageContent,
    metadata: doc.metadata,
    score,
  }));
}