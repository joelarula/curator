
import { HuggingFaceTransformersEmbeddings } from '@langchain/community/embeddings/huggingface_transformers';
import { PrismaVectorStore } from '@langchain/community/vectorstores/prisma';
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Chunk } from '@prisma/client';
import type { FileData } from '@prisma/client';
import { GoogleGenerativeAI } from '@google/generative-ai';
import 'dotenv/config';

export const xenova_all_minilm_l6_v2 = 'Xenova/all-MiniLM-L6-v2'; // 384-dimensional vectors, runs locally

const connectionString = `${process.env.DATABASE_URL}`;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

//const enabled = process.env.ENABLE_VECTOR_STORE === 'true';

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
            }
        }
    );
}


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

        //if(latestVersion && latestVersion.hash === file.hash) {
        //    console.log(` File "${file.name}" with same hash already exists. Skipping addition.`);
        //    return latestVersion;
        //}

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
                `INSERT INTO "Chunk" ("fileId", "text", "hash", "modelId", "xenova_all_minilm_l6_v2", "selectionStart", "selectionEnd")
                VALUES ($1, $2, $3, $4, $5::vector, NULL, NULL)`,
                savedFile.id,
                chunkText,
                file.hash,
                model.id,
                `[${vectorData.join(',')}]`
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

export async function consult(query: string, k: number = 5) {
    const vectorStore = await initializeLangchainVectorStore();
    console.log(`✅ Consult > "${query}".`);
    const results = await vectorStore.similaritySearchWithScore(query, k);

    return results.map(([doc, score]: [any, any]) => ({
        content: doc.pageContent,
        metadata: doc.metadata,
        score,
    }));
}

export async function ragAgent(query: string, k: number = 5) {
    console.log(`✅ RAG Agent > "${query}".`);
    
    // Get relevant context from vector store
    const vectorStore = await initializeLangchainVectorStore();
    const results = await vectorStore.similaritySearchWithScore(query, k);
    
    // Build context from top results
    const context = results
        .map(([doc, score]: [any, any], index: number) => 
            `[${index + 1}] (relevance: ${score.toFixed(4)})\n${doc.pageContent}`
        )
        .join('\n\n---\n\n');
    
    // Initialize Google Generative AI
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        throw new Error('GOOGLE_API_KEY environment variable is required');
    }
    
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
        model: 'gemini-2.5-flash',
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
        }
    });
    
    // Create RAG prompt
    const prompt = `You are a helpful AI assistant. Answer the user's question based on the provided context from the knowledge base.

Context from knowledge base:
${context}

User question: ${query}

Provide a comprehensive answer based on the context above. If the context doesn't contain enough information to fully answer the question, acknowledge what you know and what might be missing.`;
    
    // Generate response with retry logic
    let result;
    let retries = 3;
    let delay = 1000; // Start with 1 second
    
    for (let i = 0; i < retries; i++) {
        try {
            result = await model.generateContent(prompt);
            break; // Success, exit loop
        } catch (error: any) {
            if (error.status === 429 && i < retries - 1) {
                console.log(`Rate limited, retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; // Exponential backoff
            } else {
                throw error; // Re-throw if not rate limit or final retry
            }
        }
    }
    
    if (!result) {
        throw new Error('Failed to generate content after retries');
    }
    
    const response = result.response;
    const answer = response.text();
    
    return {
        answer,
        sources: results.map(([doc, score]: [any, any]) => ({
            content: doc.pageContent,
            metadata: doc.metadata,
            score,
        }))
    };
}