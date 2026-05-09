
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import type { FileData } from '@prisma/client';
import { initializeLangchainVectorStore, xenova_all_minilm_l6_v2 } from '../langchain/langchain.service';
import { HuggingFaceTransformersEmbeddings } from '@langchain/community/embeddings/huggingface_transformers';
import 'dotenv/config';

const connectionString = `${process.env.DATABASE_URL}`;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });


export async function save(file: FileData) {

    console.log(`✅ Adding file "${file.name}"`);
    const vectorStore = await initializeLangchainVectorStore();

    try {

        const latestVersion = await prisma.fileData.findFirst({
            where: {
                name: file.name,
                projectId: file.projectId
            },
            orderBy: {
                name: 'desc'
            },
            select: {
                id: true,
                name: true,
                hash: true
            }
        });

        if (latestVersion) {
            console.log(` New version of file "${file.name}" detected. Previous hash: ${latestVersion.hash}, New hash: ${file.hash}`);
            prisma.chunk.deleteMany({
                where: {
                    fileId: latestVersion.id
                }
            });
        }

        const savedFile = await prisma.fileData.upsert({
            where: {
                name_projectId: {
                    name: file.name,
                    projectId: file.projectId
                }
            },
            update: {
                hash: file.hash,
                content: file.content,
                size: file.size,
                mimeType: file.mimeType,
                source: file.source,
            },
            create: {
                name: file.name,
                hash: file.hash,
                size: file.size,
                mimeType: file.mimeType,
                content: file.content,
                source: file.source,
                projectId: file.projectId,
            }
        });


        const text = file.content ? Buffer.from(file.content, 'base64').toString('utf-8') : "";
        console.log(`✅ Adding text "${text.slice(0, 100)}..."`);

        const model = await prisma.model.findFirst({
            where: { name: xenova_all_minilm_l6_v2 }
        });

        if (!model) {
            throw new Error('Default embedding model not found');
        }

        const embeddings = new HuggingFaceTransformersEmbeddings({
            model: xenova_all_minilm_l6_v2
        });

        // Use LangChain's RecursiveCharacterTextSplitter
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1024,
            chunkOverlap: 100,
        });
        const textChunks = await splitter.splitText(text);
        let chunkCount = 0;
        for (const chunkText of textChunks) {
            const vectorData = await embeddings.embedQuery(chunkText);
            console.log(`✅ Embeddings created for chunk: "${chunkText.slice(0, 40)}..."`);
            await prisma.$executeRawUnsafe(
                `INSERT INTO "Chunk" ("fileId", "text", "hash", "modelId", "xenova_all_minilm_l6_v2", "projectId", "selectionStart", "selectionEnd")
                VALUES ($1, $2, $3, $4, $5::vector, $6, NULL, NULL)`,
                savedFile.id,
                chunkText,
                file.hash,
                model.id,
                `[${vectorData.join(',')}]`,
                file.projectId
            );
            chunkCount++;
        }
        console.log(`✅ Created ${chunkCount} chunks for file "${savedFile.name}"`);

        console.log('✅ File and chunks created successfully');
        return savedFile;

    } catch (error) {
        console.error('Error adding file:', error);
        throw error;
    }
}

export async function remove(fileName: string, projectId: number) {
    console.log(`✅ Removing file "${fileName}"`);
    const file = await prisma.fileData.findFirst({
        where: {
            name: fileName,
            projectId: projectId
        }
    });

    if (!file) {
        console.log(` File "${fileName}" not found.`);
        return null;
    }

    await prisma.chunk.deleteMany({
        where: {
            fileId: file.id
        }
    });

    await prisma.fileData.delete({
        where: {
            id: file.id
        }
    });

    console.log(`✅ File "${fileName}" and its chunks removed successfully.`);
    return file;
}
