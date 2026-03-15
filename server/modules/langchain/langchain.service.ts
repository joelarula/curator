
import { HuggingFaceTransformersEmbeddings } from '@langchain/community/embeddings/huggingface_transformers';
import { PrismaVectorStore } from '@langchain/community/vectorstores/prisma';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Chunk } from '@prisma/client';
import 'dotenv/config';

export const xenova_all_minilm_l6_v2 = 'Xenova/all-MiniLM-L6-v2'; // 384-dimensional vectors, runs locally

const connectionString = `${process.env.DATABASE_URL}`;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

export async function initializeLangchainVectorStore(): Promise<any> {

    const embeddings = new HuggingFaceTransformersEmbeddings({
        model: xenova_all_minilm_l6_v2
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
                fileId: true,
                modelId: true,
                projectId: true, // Enable filtering by projectId
            }
        }
    );
}
