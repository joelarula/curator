/**
 * ChunkingService.ts
 *
 * Text embedding pipeline — the ingestion layer of the RAG (Retrieval-
 * Augmented Generation) system.
 *
 * Responsibilities:
 *   - Splits a Text record's content into overlapping chunks using
 *     LangChain's RecursiveCharacterTextSplitter (1000 chars / 200 overlap).
 *   - Generates a vector embedding for each chunk using Google's
 *     `text-embedding-004` model (multilingual, optimised for Estonian).
 *   - Persists each chunk + its embedding vector into the `Chunk` table.
 *     Uses raw `$executeRaw` SQL because Prisma's type system doesn't natively
 *     support pgvector's `::vector` cast; standard `create` calls fail.
 *
 * Prerequisites:
 *   - PostgreSQL must have the `pgvector` extension installed.
 *   - The `Chunk` table must have a `text_embedding_004` column of type `vector`.
 *
 * Future use:
 *   These stored vectors enable semantic similarity search:
 *   a user query is embedded and the nearest-neighbour chunks are retrieved
 *   to ground Gemini answers in the actual corpus (NotebookLM-style Q&A).
 */
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { TaskType } from "@google/generative-ai";
import { PrismaClient } from "@prisma/client";
import dotenv from 'dotenv';

dotenv.config();

export class ChunkingService {
    private static embeddings = new GoogleGenerativeAIEmbeddings({
        model: "text-embedding-004", // Multilingual optimized (Estonian support)
        apiKey: process.env.GOOGLE_API_KEY || '',
        taskType: TaskType.RETRIEVAL_DOCUMENT,
    });

    private static splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
    });

    /**
     * Chunks a text entity and generates embeddings for each chunk.
     */
    static async createChunksFromText(prisma: PrismaClient, textId: string, userId: string) {
        // 1. Fetch the text content
        const text = await prisma.text.findUnique({
            where: { id: textId }
        });

        if (!text) throw new Error(`Text with ID ${textId} not found.`);

        // 2. Clear existing chunks (if any)
        await prisma.chunk.deleteMany({
            where: { textId }
        });

        // 3. Split content into fragments
        const fragments = await this.splitter.createDocuments([text.content]);

        // 4. Generate embeddings for all fragments
        const docs = fragments.map(f => f.pageContent);
        const vectors = await this.embeddings.embedDocuments(docs);

        // 5. Ensure the AIModel exists in DB for tracking
        const aiModel = await prisma.aIModel.upsert({
            where: { name: "text-embedding-004" },
            update: {},
            create: {
                name: "text-embedding-004",
                provider: "Google",
                type: "EMBEDDING"
            }
        });

        // 6. Bulk create chunks
        const chunkData = fragments.map((fragment, index) => {
            return {
                textId,
                content: fragment.pageContent,
                aiModelId: aiModel.id,
                // We use a raw query or similar if Prisma doesn't support the vector type directly in 'create'
                // But for now, we'll try to map it. If it fails, we'll use executeRaw.
                text_embedding_004: vectors[index] as any, 
                selectionStart: null,
                selectionEnd: null,
            };
        });

        // Note: Prisma 7+ with pgvector support might handle this, 
        // but often we need executeRaw for the vector cast.
        // We'll use a transaction for safety.
        // 7. Insert Chunks using raw SQL for pgvector support
        for (const chunk of chunkData) {
            await prisma.$executeRaw`
                INSERT INTO "Chunk" ("id", "textId", "content", "aiModelId", "text_embedding_004", "createdAt")
                VALUES (
                    ${Math.random().toString(36).substring(7)}, 
                    ${chunk.textId}, 
                    ${chunk.content}, 
                    ${chunk.aiModelId}, 
                    ${chunk.text_embedding_004}::vector,
                    NOW()
                )
            `;
        }

        return chunkData.length;
    }
}
