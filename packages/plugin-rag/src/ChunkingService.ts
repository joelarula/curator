import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { TaskType } from "@google/generative-ai";
import dotenv from 'dotenv';

dotenv.config();

export interface TextChunk {
  content: string;
  embedding?: number[];
  index: number;
}

export interface ChunkingOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  model?: string;
  apiKey?: string;
}

/**
 * ChunkingService
 * Text splitting and embedding generation for RAG pipelines.
 */
export class ChunkingService {
  private static defaultEmbeddings = new GoogleGenerativeAIEmbeddings({
    model: "text-embedding-004",
    apiKey: process.env.GOOGLE_API_KEY || '',
    taskType: TaskType.RETRIEVAL_DOCUMENT,
  });

  private static defaultSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });

  /**
   * Splits text content into overlapping fragments and optionally generates embeddings.
   */
  static async splitAndEmbed(
    content: string,
    options: ChunkingOptions & { embed?: boolean } = {}
  ): Promise<TextChunk[]> {
    const splitter = (options.chunkSize || options.chunkOverlap)
      ? new RecursiveCharacterTextSplitter({
          chunkSize: options.chunkSize || 1000,
          chunkOverlap: options.chunkOverlap || 200,
        })
      : this.defaultSplitter;

    const fragments = await splitter.createDocuments([content]);
    const docs = fragments.map(f => f.pageContent);

    let vectors: number[][] = [];
    if (options.embed !== false) {
      const embeddings = (options.apiKey || options.model)
        ? new GoogleGenerativeAIEmbeddings({
            model: options.model || "text-embedding-004",
            apiKey: options.apiKey || process.env.GOOGLE_API_KEY || '',
            taskType: TaskType.RETRIEVAL_DOCUMENT,
          })
        : this.defaultEmbeddings;

      vectors = await embeddings.embedDocuments(docs);
    }

    return fragments.map((fragment, index) => ({
      content: fragment.pageContent,
      embedding: vectors[index],
      index,
    }));
  }

  /**
   * Chunks a text entity and persists to database if Chunk table or raw SQL is supported.
   */
  static async createChunksFromText(prisma: any, textId: string, _userId?: string) {
    const text = await prisma.text.findUnique({
      where: { id: textId },
    });

    if (!text) throw new Error(`Text with ID ${textId} not found.`);

    const chunks = await this.splitAndEmbed(text.content, { embed: true });

    // Optional database persistence if chunk model exists
    if (prisma.chunk) {
      await prisma.chunk.deleteMany({
        where: { textId },
      }).catch(() => {});

      for (const chunk of chunks) {
        try {
          await prisma.chunk.create({
            data: {
              textId,
              content: chunk.content,
              text_embedding_004: chunk.embedding,
            },
          });
        } catch {
          // If schema requires raw vector SQL (pgvector)
          try {
            await prisma.$executeRaw`
              INSERT INTO "Chunk" ("id", "textId", "content", "createdAt")
              VALUES (
                ${Math.random().toString(36).substring(7)},
                ${textId},
                ${chunk.content},
                NOW()
              )
            `;
          } catch {}
        }
      }
    }

    return chunks.length;
  }
}
